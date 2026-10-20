/**
 * ============================================
 *  ALIXDEV BOT - Daftar Perintah
 *  © Ali Ibnu Jabir - All Rights Reserved
 * ============================================
 */

const fs = require('fs')
const os = require('os')
const { Sticker, StickerTypes } = require('wa-sticker-formatter')
const { makeBrat } = require('./lib/brat')

const TIKTOK_RE = /https?:\/\/(?:[\w-]+\.)?tiktok\.com\/\S+/i
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }

// ---------- HELPER PESAN ----------
const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'editedMessage']
const VIEW_ONCE = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']

// Buka pembungkus pesan, catat apakah ada pembungkus view-once
function unwrap(message) {
  let cur = message
  let viewOnce = false
  for (let i = 0; i < 6 && cur; i++) {
    const k = WRAPPERS.find((w) => cur[w])
    if (!k) break
    if (VIEW_ONCE.includes(k)) viewOnce = true
    cur = cur[k].message
  }
  return { content: cur, viewOnce }
}

function getContext(message) {
  const { content } = unwrap(message)
  if (!content) return null
  return Object.values(content).find((v) => v && typeof v === 'object' && v.contextInfo)?.contextInfo || null
}

function findMedia(message, types) {
  const { content, viewOnce } = unwrap(message)
  if (!content) return null
  const type = types.find((t) => content[t])
  if (!type) return null
  return { type, node: content[type], content, viewOnce: viewOnce || content[type].viewOnce === true }
}

// Cari media di pesan itu sendiri (kirim + caption) ATAU di pesan yang di-reply
function pickMedia(msg, types) {
  const own = findMedia(msg.message, types)
  if (own) return { ...own, holder: { key: msg.key, message: own.content } }

  const ctx = getContext(msg.message)
  if (ctx?.quotedMessage) {
    const q = findMedia(ctx.quotedMessage, types)
    if (q) {
      return {
        ...q,
        holder: {
          key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant, fromMe: false },
          message: q.content,
        },
      }
    }
  }
  return null
}

function formatUptime(ms) {
  const t = Math.floor(ms / 1000)
  const d = Math.floor(t / 86400)
  const h = Math.floor((t % 86400) / 3600)
  const m = Math.floor((t % 3600) / 60)
  const parts = []
  if (d) parts.push(`${d} Hari`)
  if (d || h) parts.push(`${h} Jam`)
  if (d || h || m) parts.push(`${m} Menit`)
  parts.push(`${t % 60} Detik`)
  return parts.join(', ')
}

// Jam & sapaan WIB
function waktuWIB() {
  const now = new Date()
  const jam = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .format(now).replace(/\./g, ':')
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).format(now)) % 24
  const sapaan = h >= 4 && h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam'
  return { jam, sapaan }
}

// Bikin kotak menu: 「 JUDUL 」 ┌ ├ └
const box = (title, items) =>
  `「 ${title} 」\n` +
  items.map((it, i) => `${items.length === 1 ? '└' : i === 0 ? '┌' : i === items.length - 1 ? '└' : '│'} ◦ ${it}`).join('\n')

// ---------- FABRIK PERINTAH ----------
module.exports = function createCommands({ config, downloadMedia, fetchFn = fetch, startedAt = Date.now() }) {
  const wm = `© ${config.watermark}`
  const p = config.prefix

  const reply = (sock, msg, content) => sock.sendMessage(msg.key.remoteJid, content, { quoted: msg })
  const react = (sock, msg, emoji) =>
    sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }).catch(() => {})

  // ----- TikTok (lewat API tikwm) -----
  async function tiktok(url) {
    const res = await fetchFn('https://www.tikwm.com/api/?hd=1&url=' + encodeURIComponent(url), { headers: UA })
    const json = await res.json()
    if (json.code !== 0 || !json.data) throw new Error(json.msg || 'Video tidak ditemukan')
    const abs = (u) => (u ? (u.startsWith('http') ? u : 'https://www.tikwm.com' + u) : null)
    return {
      video: abs(json.data.hdplay || json.data.play),
      audio: abs(json.data.music),
      title: (json.data.title || '').trim(),
      likes: Number(json.data.digg_count) || 0,
    }
  }

  async function getBuffer(url) {
    const res = await fetchFn(url, { headers: UA })
    if (!res.ok) throw new Error('Gagal download filenya (HTTP ' + res.status + ')')
    return Buffer.from(await res.arrayBuffer())
  }

  const extractUrl = (args) => args.join(' ').match(TIKTOK_RE)?.[0]

  // ---------- PERINTAH ----------
  const commands = {
    // ===== .menu =====
    menu: async (sock, msg) => {
      const { sapaan } = waktuWIB()
      const nama = msg.pushName || 'bro'
      const caption =
        `© ${config.botName} Bot ${new Date().getFullYear()}\n\n` +
        `Woy ${nama}, selamat ${sapaan} 👋 mau ngapain nih?\n\n` +
        `◦ Mode : Public\n` +
        `◦ Dev : ${config.developer}\n\n` +
        box('MAINMENU', [`${p}menu`, `${p}info`]) + '\n\n' +
        box('DOWNLOADER', [`${p}dl <link tiktok>`, `${p}dls <link tiktok>`]) + '\n\n' +
        box('TOOLSMENU', [`${p}rvo`, `${p}s`, `${p}brat <teks>`]) + '\n\n' +
        wm

      if (fs.existsSync(config.menuImage)) {
        await reply(sock, msg, { image: fs.readFileSync(config.menuImage), caption })
      } else {
        await reply(sock, msg, { text: caption })
      }
    },

    // ===== .info =====
    info: async (sock, msg) => {
      const rows = [
        `Nama : ${config.botName}`,
        `Versi : ${config.version}`,
        `Dev : ${config.developer}`,
        `Prefix : ${p}`,
        `Uptime : ${formatUptime(Date.now() - startedAt)}`,
        `Library : Baileys`,
        `Node : ${process.version}`,
        `Platform : ${os.platform()} (${os.arch()})`,
      ]
      if (config.github) rows.push(`GitHub : ${config.github}`)
      rows.push('Lisensi : All Rights Reserved')

      const text =
        box('INFO BOT', rows) + '\n\n' +
        `Bot ini gak boleh diedit atau dijual tanpa izin dev ya.\n\n` +
        wm
      await reply(sock, msg, { text })
    },

    // ===== .dl <link tiktok> → video =====
    dl: async (sock, msg, args) => {
      const url = extractUrl(args)
      if (!url) return reply(sock, msg, { text: `Link tiktoknya mana bro? Contoh:\n${p}dl https://vt.tiktok.com/xxxx\n\n${wm}` })

      await react(sock, msg, '⏳')
      const { video, title, likes } = await tiktok(url)
      if (!video) throw new Error('Ini bukan video, kayaknya slideshow foto')
      const buffer = await getBuffer(video)
      const cap = (title.length > 900 ? title.slice(0, 900) + '...' : title) || '-'
      const caption = `Caption : ${cap}\nLike : ${likes.toLocaleString('id-ID')}\n\n${wm}`
      await reply(sock, msg, { video: buffer, mimetype: 'video/mp4', caption })
      await react(sock, msg, '✅')
    },

    // ===== .dls <link tiktok> → audio =====
    dls: async (sock, msg, args) => {
      const url = extractUrl(args)
      if (!url) return reply(sock, msg, { text: `Link tiktoknya mana bro? Contoh:\n${p}dls https://vt.tiktok.com/xxxx\n\n${wm}` })

      await react(sock, msg, '⏳')
      const { audio } = await tiktok(url)
      if (!audio) throw new Error('Audionya gak ketemu')
      const buffer = await getBuffer(audio)
      await reply(sock, msg, { audio: buffer, mimetype: 'audio/mpeg' })
      await react(sock, msg, '✅')
    },

    // ===== .rvo → buka sekali lihat (reply pesannya) =====
    rvo: async (sock, msg) => {
      const media = pickMedia(msg, ['imageMessage', 'videoMessage', 'audioMessage'])
      if (!media) return reply(sock, msg, { text: `Reply dulu foto/video sekali lihatnya pake ${p}rvo\n\n${wm}` })
      if (!media.viewOnce) return reply(sock, msg, { text: `Itu bukan pesan sekali lihat bro\n\n${wm}` })

      await react(sock, msg, '⏳')
      const buffer = await downloadMedia(sock, media.holder)

      // Tanpa caption asli → kirim polos. Ada caption → caption + watermark.
      const orig = (media.node.caption || '').trim()
      const withCap = orig ? { caption: `${orig}\n\n${wm}` } : {}

      if (media.type === 'imageMessage') await reply(sock, msg, { image: buffer, ...withCap })
      else if (media.type === 'videoMessage') await reply(sock, msg, { video: buffer, ...withCap })
      else await reply(sock, msg, { audio: buffer, mimetype: media.node.mimetype || 'audio/ogg; codecs=opus', ptt: !!media.node.ptt })
      await react(sock, msg, '✅')
    },

    // ===== .s → foto jadi stiker =====
    s: async (sock, msg) => {
      const media = pickMedia(msg, ['imageMessage'])
      if (!media) return reply(sock, msg, { text: `Kirim foto pake caption ${p}s, atau reply fotonya pake ${p}s\n\n${wm}` })

      await react(sock, msg, '⏳')
      const buffer = await downloadMedia(sock, media.holder)
      const sticker = new Sticker(buffer, {
        pack: config.botName,
        author: config.watermark,
        type: StickerTypes.FULL,
        quality: 70,
      })
      await reply(sock, msg, await sticker.toMessage())
      await react(sock, msg, '✅')
    },

    // ===== .brat <teks> → stiker gaya brat (atau reply teks) =====
    brat: async (sock, msg, args) => {
      let text = args.join(' ').trim()
      if (!text) {
        const q = getContext(msg.message)?.quotedMessage
        const qc = q && unwrap(q).content
        text = (qc?.conversation || qc?.extendedTextMessage?.text || '').trim()
      }
      if (!text) return reply(sock, msg, { text: `Tulis teksnya dong, contoh:\n${p}brat aku capek banget\n\n${wm}` })

      await react(sock, msg, '⏳')
      const png = await makeBrat(text)
      const sticker = new Sticker(png, {
        pack: config.botName,
        author: config.watermark,
        type: StickerTypes.FULL,
        quality: 80,
      })
      await reply(sock, msg, await sticker.toMessage())
      await react(sock, msg, '✅')
    },
  }

  return commands
}

module.exports._internal = { unwrap, findMedia, pickMedia, getContext, formatUptime }
