/**
 * AlixDev Bot - game di dalam WhatsApp
 * © Ali Ibnu Jabir - All Rights Reserved
 *
 * Game: suit, tebak angka, tic tac toe (lawan bot).
 * Jawaban pemain dibaca dari chat biasa selama game aktif (lihat handlePlain).
 */

const rand = (n) => Math.floor(Math.random() * n)
const SESSION_TTL = 5 * 60 * 1000 // game hangus kalau 5 menit nggak dimainin

module.exports = function createGames({ config, reply, choose, wm }) {
  const p = config.prefix
  const sessions = new Map()

  const keyOf = (msg) =>
    `${msg.key.remoteJid}|${msg.key.fromMe ? 'me' : msg.key.participant || msg.key.remoteJid}`

  function begin(msg, game, data) {
    const key = keyOf(msg)
    end(key)
    const s = { game, data, timer: null }
    sessions.set(key, s)
    touch(key)
  }
  function touch(key) {
    const s = sessions.get(key)
    if (!s) return
    clearTimeout(s.timer)
    s.timer = setTimeout(() => sessions.delete(key), SESSION_TTL)
    s.timer.unref?.()
  }
  function end(key) {
    const s = sessions.get(key)
    if (s) clearTimeout(s.timer)
    sessions.delete(key)
  }

  // ================= SUIT =================
  const SUIT = { batu: '🪨', gunting: '✂️', kertas: '📄' }
  const BEATS = { batu: 'gunting', gunting: 'kertas', kertas: 'batu' }
  const suitButtons = Object.keys(SUIT).map((k) => ({ text: `${SUIT[k]} ${k[0].toUpperCase() + k.slice(1)}`, id: `${p}suit ${k}` }))
  const suitHint = `Ketik: ${p}suit batu / gunting / kertas`

  async function suit(sock, msg, args) {
    const pick = (args[0] || '').toLowerCase()
    if (!SUIT[pick]) {
      return choose(sock, msg, { text: '✊ Suit lawan bot yuk! Pilih salah satu:', buttons: suitButtons, hint: suitHint })
    }
    const bot = Object.keys(SUIT)[rand(3)]
    const hasil = pick === bot ? 'Seri 🤝' : BEATS[pick] === bot ? 'Lu menang 🎉' : 'Lu kalah 😹'
    await choose(sock, msg, {
      text: `Lu  : ${SUIT[pick]} ${pick}\nBot : ${SUIT[bot]} ${bot}\n\n*${hasil}*\n\nMain lagi?`,
      buttons: suitButtons,
      hint: suitHint,
    })
  }

  // ================= TEBAK ANGKA =================
  const tebakAngka = {
    async start(sock, msg) {
      begin(msg, tebakAngka, { number: 1 + rand(100), left: 7 })
      await reply(sock, msg, {
        text:
          `🔢 *TEBAK ANGKA*\n\nGue lagi mikirin angka 1 sampai 100. Tebak dong!\n` +
          `Kesempatan lu 7 kali. Kirim angkanya aja ya.\n` +
          `Nyerah? ketik ${p}stop\n\n${wm}`,
      })
    },
    async onMessage(sock, msg, text, s, key) {
      if (!/^\d{1,3}$/.test(text)) return false
      const n = Number(text)
      s.data.left--
      if (n === s.data.number) {
        end(key)
        await reply(sock, msg, { text: `🎉 Bener banget! Angkanya *${s.data.number}*.\nLu nebak dengan sisa ${s.data.left} kesempatan.\n\n${wm}` })
      } else if (s.data.left <= 0) {
        end(key)
        await reply(sock, msg, { text: `😹 Kesempatan abis. Angkanya tadi *${s.data.number}*.\nCoba lagi: ${p}tebakangka\n\n${wm}` })
      } else {
        touch(key)
        await reply(sock, msg, { text: `${n < s.data.number ? '⬆️ Kekecilan' : '⬇️ Kegedean'} bro. Sisa ${s.data.left} kesempatan.` })
      }
      return true
    },
  }

  // ================= TIC TAC TOE (lawan bot) =================
  const WINS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]
  const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']
  const render = (b) =>
    [0, 3, 6].map((r) => [0, 1, 2].map((c) => (b[r + c] === 'X' ? '❌' : b[r + c] === 'O' ? '⭕' : NUM[r + c])).join('')).join('\n')
  const winner = (b) => {
    for (const [a, c, d] of WINS) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]
    return b.every(Boolean) ? 'draw' : null
  }
  const findWin = (b, who) => {
    for (const [a, c, d] of WINS) {
      const line = [a, c, d]
      const mine = line.filter((i) => b[i] === who).length
      const empty = line.filter((i) => !b[i])
      if (mine === 2 && empty.length === 1) return empty[0]
    }
    return -1
  }
  function botMove(b) {
    const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
    if (Math.random() < 0.2) return free[rand(free.length)] // kadang salah langkah biar bisa dikalahin
    let m = findWin(b, 'O')
    if (m < 0) m = findWin(b, 'X')
    if (m < 0 && !b[4]) m = 4
    if (m < 0) {
      const corners = [0, 2, 6, 8].filter((i) => !b[i])
      if (corners.length) m = corners[rand(corners.length)]
    }
    return m >= 0 ? m : free[rand(free.length)]
  }

  const ttt = {
    async start(sock, msg) {
      begin(msg, ttt, { board: Array(9).fill(null) })
      await reply(sock, msg, {
        text:
          `❌⭕ *TIC TAC TOE*\n\nLu ❌, bot ⭕. Lu jalan duluan.\nKirim angka 1-9 buat milih kotak.\n` +
          `Nyerah? ketik ${p}stop\n\n${render(Array(9).fill(null))}\n\n${wm}`,
      })
    },
    async onMessage(sock, msg, text, s, key) {
      if (!/^[1-9]$/.test(text)) return false
      const b = s.data.board
      const i = Number(text) - 1
      if (b[i]) {
        await reply(sock, msg, { text: 'Kotak itu udah keisi bro, pilih yang lain.' })
        return true
      }
      b[i] = 'X'
      let w = winner(b)
      if (!w) {
        b[botMove(b)] = 'O'
        w = winner(b)
      }
      const papan = render(b)
      if (w) {
        end(key)
        const hasil = w === 'X' ? 'Lu menang! 🎉' : w === 'O' ? 'Bot menang 😹' : 'Seri 🤝'
        await reply(sock, msg, { text: `${papan}\n\n*${hasil}*\nMain lagi: ${p}ttt\n\n${wm}` })
      } else {
        touch(key)
        await reply(sock, msg, { text: `${papan}\n\nGiliran lu, kirim angka 1-9.` })
      }
      return true
    },
  }

  // ================= PERINTAH =================
  const commands = {
    game: async (sock, msg) =>
      choose(sock, msg, {
        text: '🎮 *GAME CENTER*\nMau main apa nih?',
        buttons: [
          { text: '✊ Suit', id: `${p}suit` },
          { text: '🔢 Tebak Angka', id: `${p}tebakangka` },
          { text: '❌⭕ Tic Tac Toe', id: `${p}ttt` },
        ],
        hint: `${p}suit  |  ${p}tebakangka  |  ${p}ttt`,
      }),
    suit,
    tebakangka: (sock, msg) => tebakAngka.start(sock, msg),
    ttt: (sock, msg) => ttt.start(sock, msg),
    stop: async (sock, msg) => {
      const key = keyOf(msg)
      if (!sessions.has(key)) return reply(sock, msg, { text: `Lu lagi nggak main game apa-apa.\n\n${wm}` })
      end(key)
      await reply(sock, msg, { text: `Oke, gamenya dihentiin.\n\n${wm}` })
    },
  }

  // Dipanggil untuk pesan biasa (tanpa prefix). true = pesan dipakai game.
  async function handlePlain(sock, msg, text) {
    const key = keyOf(msg)
    const s = sessions.get(key)
    if (!s) return false
    return s.game.onMessage(sock, msg, text.trim(), s, key)
  }

  return { commands, handlePlain }
}
