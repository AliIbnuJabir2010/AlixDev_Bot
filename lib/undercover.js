/**
 * ============================================
 *  ALIXDEV BOT - Modul Game Undercover
 *  © Ali Ibnu Jabir - All Rights Reserved
 * ============================================
 *  Modul terpisah. Tidak membuat koneksi / sesi WA baru:
 *  semua fungsi menerima `sock` milik bot yang sudah ada.
 *
 *  Command : #ucjoin  #ucstart  #ucstop  #uckick (tambahan, hanya untuk host)
 *  Kata    : lib/undercover-words.js
 *  Aturan  : objek RULES di bawah
 *
 *  Penyambung ke index.js:
 *    handleMessage(sock, msg)      -> dipanggil untuk tiap pesan masuk
 *    handlePollUpdates(sock, ups)  -> dipanggil dari event 'messages.update'
 *    getStoredMessage(key)         -> cadangan untuk getMessage Baileys (dekripsi suara polling)
 *    noteSent(res)                 -> dipanggil tiap bot mengirim pesan
 * ============================================
 */
'use strict'

const crypto = require('crypto')
const DEFAULT_WORDS = require('./undercover-words')

// ---------- ATURAN GAME (ubah di sini, bukan di logika) ----------
const RULES = {
  prefix: '#',
  minPlayers: 3,
  maxPlayers: 10,
  maxSessions: 3,
  maxClueWords: 3,
  dmDelayMs: 700, // jeda antar pesan pribadi (hindari kirim beruntun)
  gameOverDelayMs: 2500, // jeda antara pengumuman eliminasi dan GAME OVER
  selfSendSettleMs: 1000, // tunggu sebentar sebelum menilai pesan dari akun bot sendiri
  pollQuestion: 'Siapa yang kamu curigai sebagai Impostor?',
}

const T = 'UNDERCOVER'
const LINE = '━━━━━━━━━━━━━━'
const box = (title, lines) => `${title}\n${LINE}\n${lines.join('\n')}`

// ---------- UTIL ----------
// "628123:5@s.whatsapp.net" -> "628123@s.whatsapp.net" ; "123:4@lid" -> "123@lid"
function normJid(j) {
  if (!j || typeof j !== 'string' || !j.includes('@')) return null
  const [u, s] = j.split('@')
  const user = u.split(':')[0]
  if (!user) return null
  return `${user}@${s === 'c.us' ? 's.whatsapp.net' : s}`
}

const maskJid = (j) => {
  const u = String(j || '').split('@')[0]
  return u.length > 4 ? `***${u.slice(-4)}` : '***'
}

const cleanName = (s, max = 30) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max)

// teks biasa saja (conversation / extendedText), pembungkus ephemeral dibuka
function textOf(message) {
  let c = message
  for (let i = 0; i < 4 && c && c.ephemeralMessage; i++) c = c.ephemeralMessage.message
  return c?.conversation || c?.extendedTextMessage?.text || ''
}

const sha256hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')

const bin = (x) => Buffer.from(String(x), 'utf8')

// PollVoteMessage { repeated bytes selectedOptions = 1 }
function parseSelected(buf) {
  const out = []
  let i = 0
  while (i < buf.length) {
    const tag = buf[i++]
    let len = 0
    let shift = 0
    for (;;) { const b = buf[i++]; len |= (b & 0x7f) << shift; if (!(b & 0x80)) break; shift += 7 }
    if (tag === 0x0a) out.push(Buffer.from(buf.subarray(i, i + len)))
    i += len
  }
  return out
}

// Dekripsi suara polling WhatsApp (skema sama dengan Baileys). Melempar error kalau kombinasi JID salah.
function decryptPollVote(enc, { pollMsgId, creator, voter, secret }) {
  const sign = Buffer.concat([bin(pollMsgId), bin(creator), bin(voter), bin('Poll Vote'), Buffer.from([1])])
  const key0 = crypto.createHmac('sha256', Buffer.alloc(32)).update(Buffer.from(secret)).digest()
  const decKey = crypto.createHmac('sha256', key0).update(sign).digest()
  const payload = Buffer.from(enc.encPayload)
  const d = crypto.createDecipheriv('aes-256-gcm', decKey, Buffer.from(enc.encIv))
  d.setAAD(bin(`${pollMsgId}\u0000${voter}`))
  d.setAuthTag(payload.subarray(-16))
  return parseSelected(Buffer.concat([d.update(payload.subarray(0, -16)), d.final()]))
}

function toMs(v) {
  if (v == null) return 0
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v) || 0
}

// ---------- FABRIK ----------
function createUndercover({ rules = {}, words = DEFAULT_WORDS, rng = (n) => crypto.randomInt(n), log = console } = {}) {
  const R = { ...RULES, ...rules }
  const WORDS = words.filter((w) => Array.isArray(w) && w.length === 2 && w[0] && w[1] && String(w[0]).toUpperCase() !== String(w[1]).toUpperCase())
  if (!WORDS.length) throw new Error('undercover: daftar kata kosong')

  const groups = new Map() // gid -> state (SATU state per grup; kunci = JID grup)
  const locks = new Map() // gid -> rantai promise (serialisasi event per grup)
  const pollIndex = new Map() // id pesan polling -> { gid, state }
  const botSent = new Set() // id pesan yang dikirim bot (untuk membedakan dari ketikan manual akun bot)
  const seen = new Set() // id pesan yang sudah ditangani modul ini
  const history = new Map() // gid -> { impostor:Set, pairs:[] } (variasi acak lintas game)
  let stateSeq = 0
  let arrivalSeq = 0

  const CMD = { join: `${R.prefix}ucjoin`, start: `${R.prefix}ucstart`, stop: `${R.prefix}ucstop`, kick: `${R.prefix}uckick` }

  // ---------- LOCK & SIKLUS HIDUP ----------
  function locked(gid, fn) {
    const prev = locks.get(gid) || Promise.resolve()
    const next = prev.then(fn).catch((e) => log.error('[undercover] error:', e?.message || e))
    locks.set(gid, next)
    next.then(() => { if (locks.get(gid) === next) locks.delete(gid) })
    return next
  }

  const alive = (st) => !!st && !st.dead && groups.get(st.gid) === st

  // Hentikan SEMUA proses terkait state ini seketika: timer, polling, state grup.
  function kill(st) {
    st.dead = true
    for (const s of st.sleepers) { clearTimeout(s.t); s.resolve(false) }
    st.sleepers.clear()
    if (st.poll) pollIndex.delete(st.poll.id)
    if (groups.get(st.gid) === st) groups.delete(st.gid)
  }

  // Tidur yang bisa dibatalkan. Mengembalikan true kalau state masih hidup setelahnya.
  function sleep(st, ms) {
    if (!ms) return Promise.resolve(alive(st))
    return new Promise((resolve) => {
      const s = { resolve }
      s.t = setTimeout(() => { st.sleepers.delete(s); resolve(alive(st)) }, ms)
      st.sleepers.add(s)
    })
  }

  function newState(gid) {
    return {
      id: ++stateSeq, gid, phase: 'lobby', // lobby | starting | announcing | clue | vote | resolving
      players: [], nextNo: 1, host: null, words: null,
      session: 0, sessionSeq: 0, warned: new Set(),
      votes: new Map(), poll: null, dead: false, sleepers: new Set(),
    }
  }

  // ---------- KIRIM PESAN ----------
  function noteSent(res) {
    const id = res?.key?.id
    if (!id) return
    botSent.add(id)
    if (botSent.size > 3000) botSent.delete(botSent.values().next().value)
  }

  async function send(sock, jid, content, opts) {
    const res = await sock.sendMessage(jid, content, opts)
    noteSent(res)
    return res
  }

  // Kirim ke grup hanya kalau game masih hidup. Melempar error kalau gagal kirim.
  async function say(sock, st, text, mentions) {
    if (!alive(st)) return null
    return send(sock, st.gid, mentions?.length ? { text, mentions } : { text })
  }

  const reply = (sock, msg, text) =>
    send(sock, msg.key.remoteJid, { text }, { quoted: msg }).catch((e) => log.error('[undercover] gagal balas:', e?.message))

  // ---------- IDENTITAS ----------
  function senderIds(sock, msg) {
    const k = msg.key || {}
    const raw = k.fromMe ? [sock.user?.id, sock.user?.lid] : [k.participant, k.participantAlt]
    return [...new Set(raw.map(normJid).filter(Boolean))]
  }

  const findPlayer = (st, ids) => st.players.find((p) => ids.some((i) => p.ids.has(i)))
  const actives = (st) => st.players.filter((p) => !p.out)
  const mergeIds = (p, ids) => ids.forEach((i) => p.ids.add(i))
  const dmJid = (p) => { const a = [...p.ids]; return a.find((i) => i.endsWith('@s.whatsapp.net')) || a[0] }

  // Pasangkan JID versi @lid dan versi nomor milik orang yang sama (best effort, tidak fatal)
  async function learnAliases(sock, st) {
    if (typeof sock.groupMetadata !== 'function') return
    try {
      const md = await sock.groupMetadata(st.gid)
      for (const part of md?.participants || []) {
        const ids = [part.id, part.lid, part.phoneNumber, part.jid].map(normJid).filter(Boolean)
        if (!ids.length) continue
        for (const p of st.players) if (ids.some((i) => p.ids.has(i))) mergeIds(p, ids)
      }
    } catch (e) {
      log.warn('[undercover] groupMetadata gagal (diabaikan):', e?.message)
    }
  }

  // ---------- PINTU MASUK: PESAN ----------
  function handleMessage(sock, msg) {
    const arrival = ++arrivalSeq
    try {
      const gid = msg?.key?.remoteJid
      if (!gid || !msg.message || gid === 'status@broadcast') return Promise.resolve()
      let inner = msg.message
      for (let i = 0; i < 4 && inner?.ephemeralMessage; i++) inner = inner.ephemeralMessage.message
      if (inner?.pollUpdateMessage) return handleRawVote(sock, msg, inner.pollUpdateMessage)

      const text = textOf(msg.message).trim()
      if (!text) return Promise.resolve()

      const first = text.split(/\s+/)[0].toLowerCase()
      const isCmd = Object.values(CMD).includes(first)
      const isGroup = gid.endsWith('@g.us')

      if (!isCmd) {
        // bukan command: hanya relevan sebagai petunjuk, di grup yang sedang fase petunjuk
        if (!isGroup || text.startsWith(R.prefix) || text.startsWith('.')) return Promise.resolve()
        if (groups.get(gid)?.phase !== 'clue') return Promise.resolve()
        const id = msg.key.id
        if (id && seen.has(id)) return Promise.resolve()
        return locked(gid, () => onClue(sock, msg, text, arrival))
      }

      const id = msg.key.id
      if (id) {
        if (seen.has(id)) return Promise.resolve()
        seen.add(id)
        if (seen.size > 3000) seen.delete(seen.values().next().value)
      }
      if (!isGroup) return reply(sock, msg, box(T, ['Undercover hanya bisa dimainkan di grup.']))

      const args = text.split(/\s+/).slice(1)
      if (first === CMD.stop) return cmdStop(sock, msg) // tanpa antre: berhenti seketika
      if (first === CMD.join) return locked(gid, () => cmdJoin(sock, msg))
      if (first === CMD.start) return locked(gid, () => cmdStart(sock, msg))
      return locked(gid, () => cmdKick(sock, msg, args))
    } catch (e) {
      log.error('[undercover] handleMessage:', e?.message || e)
      return Promise.resolve()
    }
  }

  // ---------- #ucjoin ----------
  const lobbyText = (st) =>
    box(T, [`Pemain bergabung (${st.players.length}/${R.maxPlayers})`, '', ...st.players.map((p) => `${p.no}. ${p.name}`), '', 'Menunggu pemain...'])

  async function cmdJoin(sock, msg) {
    const gid = msg.key.remoteJid
    const ids = senderIds(sock, msg)
    if (!ids.length) return reply(sock, msg, box(T, ['Identitasmu tidak terbaca. Coba lagi.']))

    let st = groups.get(gid)
    if (st && st.phase !== 'lobby') {
      return reply(sock, msg, box(T, ['Game sedang berlangsung.', 'Kamu bisa bergabung setelah game selesai.']))
    }
    if (!st) { st = newState(gid); groups.set(gid, st) }

    const exist = findPlayer(st, ids)
    if (exist) {
      mergeIds(exist, ids)
      return reply(sock, msg, box(T, ['Kamu sudah terdaftar.', '', `Pemain: ${st.players.length}/${R.maxPlayers}`]))
    }
    if (st.players.length >= R.maxPlayers) {
      return reply(sock, msg, box(T, [`Lobi penuh (${R.maxPlayers}/${R.maxPlayers}).`]))
    }

    const no = st.nextNo++
    const name = cleanName(msg.key.fromMe ? sock.user?.name || msg.pushName : msg.pushName) || `Pemain ${no}`
    st.players.push({ no, ids: new Set(ids), name, role: null, out: null, clued: false })
    return reply(sock, msg, lobbyText(st))
  }

  // ---------- #ucstart ----------
  function assignRoles(st) {
    const h = history.get(st.gid) || { impostor: null, pairs: [] }
    history.set(st.gid, h)

    // jangan pilih impostor yang sama dengan game sebelumnya kalau masih ada pilihan lain
    let pool = st.players
    if (h.impostor) {
      const others = pool.filter((p) => ![...p.ids].some((i) => h.impostor.has(i)))
      if (others.length) pool = others
    }
    const imp = pool[rng(pool.length)]

    let idxPool = WORDS.map((_, i) => i).filter((i) => !h.pairs.includes(i))
    if (!idxPool.length) idxPool = WORDS.map((_, i) => i)
    const idx = idxPool[rng(idxPool.length)]
    const [a, b] = WORDS[idx]
    const flip = rng(2) === 1
    st.words = { civilian: String(flip ? b : a).toUpperCase(), impostor: String(flip ? a : b).toUpperCase() }

    for (const p of st.players) p.role = p === imp ? 'impostor' : 'civilian'
    h.pairs.push(idx)
    while (h.pairs.length > Math.min(10, WORDS.length - 1)) h.pairs.shift()
    h.impostor = new Set(imp.ids)
  }

  async function cmdStart(sock, msg) {
    const gid = msg.key.remoteJid
    const ids = senderIds(sock, msg)
    const st = groups.get(gid)

    if (st && st.phase !== 'lobby') {
      return reply(sock, msg, box(T, ['Game sedang berjalan.', '', `Host saat ini: ${st.host?.name || '-'}`]))
    }
    const me = st && findPlayer(st, ids)
    if (!st || !me) return reply(sock, msg, box(T, ['Kamu belum bergabung.', 'Ketik #ucjoin dulu.']))
    if (st.players.length < R.minPlayers) {
      return reply(sock, msg, box(T, [`Pemain kurang. Minimal ${R.minPlayers}, sekarang ${st.players.length}.`, 'Gabung dengan #ucjoin.']))
    }

    // Dari titik ini game "diklaim": host ditetapkan secara sinkron sebelum await apa pun.
    mergeIds(me, ids)
    st.host = me
    st.phase = 'starting'

    await learnAliases(sock, st)
    if (!alive(st)) return
    assignRoles(st)

    try {
      await say(sock, st, box(T, ['Oke, game berjalan.', '', `Host: ${st.host.name}`, `Pemain: ${st.players.length}`, '', 'Clue sedang dikirim ke chat pribadi masing-masing pemain.']))
    } catch (e) {
      log.error('[undercover] gagal kirim pengumuman start:', e?.message)
      return abortStart(sock, st, null)
    }

    // kirim kata rahasia (hanya kata, tanpa peran) ke chat pribadi; kegagalan apa pun = batal
    const failed = []
    const delivered = []
    for (const p of st.players) {
      if (!alive(st)) return
      const to = dmJid(p)
      try {
        const res = await send(sock, to, { text: p.role === 'impostor' ? st.words.impostor : st.words.civilian })
        if (!res || !res.key) throw new Error('tidak ada konfirmasi kirim')
        delivered.push(p)
      } catch (e) {
        failed.push(p)
        log.error('[undercover] gagal kirim pesan pribadi ke', maskJid(to), '-', e?.message)
      }
      if (!(await sleep(st, R.dmDelayMs))) return
    }
    if (!alive(st)) return
    if (failed.length) return abortStart(sock, st, failed, delivered)

    st.session = 1
    await startSession(sock, st)
  }

  // Game batal sebelum sesi 1: kembali ke lobi (pemain tetap terdaftar), tidak ada kata yang diumumkan.
  async function abortStart(sock, st, failed, delivered = []) {
    if (!alive(st)) return
    const hostName = st.host?.name || '-'
    st.phase = 'lobby'
    st.host = null
    st.words = null
    st.session = 0
    for (const p of st.players) p.role = null

    const lines = ['Game belum bisa dimulai.', '']
    if (failed?.length) {
      lines.push('Kata belum terkirim ke:', ...failed.map((p) => `- ${p.name}`), '', `Host: ${hostName}`,
        'Minta pemain tersebut chat bot lebih dulu, lalu ketik #ucstart lagi.')
    } else {
      lines.push('Pengumuman gagal terkirim. Coba #ucstart lagi.')
    }
    await send(sock, st.gid, { text: box(T, lines) }).catch((e) => log.error('[undercover] gagal kirim info batal:', e?.message))

    // pemain yang sempat menerima kata diberi tahu supaya mengabaikannya (best effort)
    for (const p of delivered) {
      await send(sock, dmJid(p), { text: 'Game dibatalkan. Abaikan kata sebelumnya.' }).catch(() => {})
    }
  }

  // ---------- SESI & PETUNJUK ----------
  async function startSession(sock, st) {
    st.phase = 'announcing' // belum menerima petunjuk
    st.votes = new Map()
    st.warned = new Set()
    for (const p of st.players) p.clued = false

    await say(sock, st, box(`${T} — SESI ${st.session}`, [
      'Sebutkan ciri clue-mu.', '', 'Maksimal 3 kata.', 'Berikan petunjuk di grup.', '',
      'Voting dimulai setelah semua pemain aktif memberikan petunjuk.',
    ]))
    if (!alive(st)) return
    // pesan yang tiba SEBELUM titik ini dianggap pesan lama dan tidak dihitung
    st.sessionSeq = arrivalSeq
    st.phase = 'clue'
  }

  async function onClue(sock, msg, text, arrival) {
    const gid = msg.key.remoteJid
    const st = groups.get(gid)
    if (!st || st.phase !== 'clue' || arrival <= st.sessionSeq) return

    // Kalau akun bot juga pemain: pesan fromMe bisa balasan bot sendiri. Tunggu sebentar
    // supaya id pesan bot sempat tercatat, lalu abaikan yang dikirim bot.
    if (msg.key.fromMe) {
      if (!(await sleep(st, R.selfSendSettleMs))) return
      if (botSent.has(msg.key.id)) return
      if (st.phase !== 'clue') return
    }
    if (msg.key.id) {
      if (seen.has(msg.key.id)) return
      seen.add(msg.key.id)
    }

    const p = findPlayer(st, senderIds(sock, msg))
    if (!p || p.out || p.clued) return // bukan peserta / sudah keluar / sudah memberi petunjuk

    const count = text.split(/\s+/).filter(Boolean).length
    if (count > R.maxClueWords) {
      if (!st.warned.has(p.no)) {
        st.warned.add(p.no)
        await reply(sock, msg, box(T, [`${p.name}, maksimal ${R.maxClueWords} kata.`, 'Kirim ulang petunjukmu.']))
      }
      return
    }

    p.clued = true
    send(sock, gid, { react: { text: '✅', key: msg.key } }).catch(() => {})
    if (actives(st).every((x) => x.clued)) await startVoting(sock, st)
  }

  // ---------- VOTING (POLLING WHATSAPP) ----------
  function buildOptions(list) {
    const used = new Set()
    return list.map((p) => {
      const base = cleanName(p.name, 40) || `Pemain ${p.no}`
      let label = base
      let i = 2
      while (used.has(label.toLowerCase())) label = `${base} (${i++})`
      used.add(label.toLowerCase())
      return { no: p.no, label }
    })
  }

  async function startVoting(sock, st) {
    st.phase = 'vote'
    st.votes = new Map()
    if (st.poll) { pollIndex.delete(st.poll.id); st.poll = null } // polling lama tidak berlaku lagi
    const options = buildOptions(actives(st))

    await learnAliases(sock, st)
    if (!alive(st)) return
    try {
      await say(sock, st, box(`${T} — VOTING ${st.session}`, ['Pilih pemain yang kamu curigai sebagai Impostor.', '', 'Voting ditutup setelah semua pemain aktif memberikan suara.']))
      if (!alive(st)) return
      const res = await send(sock, st.gid, { poll: { name: R.pollQuestion, values: options.map((o) => o.label), selectableCount: 1 } })
      if (!alive(st)) return
      if (!res?.key?.id) throw new Error('polling tanpa id')
      st.poll = {
        id: res.key.id, message: res.message, options,
        hashes: new Map(options.map((o) => [sha256hex(o.label), o.no])),
      }
      pollIndex.set(res.key.id, { gid: st.gid, state: st })
      log.log(`[undercover] polling dibuat untuk sesi ${st.session} (${options.length} opsi), menunggu suara`)
    } catch (e) {
      log.error('[undercover] gagal membuat polling:', e?.message)
      await say(sock, st, box(T, [`Polling gagal dibuat. Host (${st.host?.name}) bisa menghentikan game dengan #ucstop.`])).catch(() => {})
    }
  }

  // dipanggil dari event 'messages.update'
  function handlePollUpdates(sock, updates) {
    const jobs = []
    for (const u of updates || []) {
      try {
        const pollId = u?.key?.id
        const entry = pollId && pollIndex.get(pollId)
        const pus = u?.update?.pollUpdates
        if (!entry || !pus?.length) continue
        jobs.push(locked(entry.gid, () => applyVotes(sock, entry, pollId, pus)))
      } catch (e) {
        log.error('[undercover] handlePollUpdates:', e?.message || e)
      }
    }
    return Promise.all(jobs)
  }

  const voterIds = (sock, key = {}) =>
    [...new Set((key.fromMe ? [sock.user?.id, sock.user?.lid] : [key.participant, key.participantAlt]).map(normJid).filter(Boolean))]

  async function applyVotes(sock, entry, pollId, pus) {
    const st = entry.state
    if (!alive(st) || st.phase !== 'vote' || !st.poll || st.poll.id !== pollId) return // polling lama / game lama
    log.log(`[undercover] update polling diterima (${pus.length} suara)`)

    for (const pu of pus) {
      const ids = voterIds(sock, pu.pollUpdateMessageKey)
      let p = findPlayer(st, ids)
      if (!p) { await learnAliases(sock, st); p = findPlayer(st, ids) }
      if (!alive(st) || st.phase !== 'vote') return
      if (!p || p.out) { log.warn('[undercover] suara dari non-peserta diabaikan:', maskJid(ids[0])); continue }
      mergeIds(p, ids)

      const ts = toMs(pu.senderTimestampMs)
      const prev = st.votes.get(p.no)
      if (prev && ts && prev.ts > ts) continue // suara yang lebih lama datang terlambat

      const sel = pu.vote?.selectedOptions || []
      if (!sel.length) { st.votes.set(p.no, { target: null, ts }); continue } // suara ditarik
      const target = st.poll.hashes.get(Buffer.from(sel[0]).toString('hex'))
      if (target == null) { log.warn('[undercover] opsi suara tidak dikenali, diabaikan'); continue }

      if (target === p.no) {
        st.votes.set(p.no, { target: null, ts })
        await say(sock, st, box(T, [`${p.name} tidak boleh memilih diri sendiri.`, 'Pilih ulang di polling.'])).catch(() => {})
        continue
      }
      st.votes.set(p.no, { target, ts })
    }

    await afterVote(sock, st)
  }

  async function afterVote(sock, st) {
    if (!alive(st) || st.phase !== 'vote') return
    const done = actives(st).filter((p) => st.votes.get(p.no)?.target != null).length
    log.log(`[undercover] voting ${done}/${actives(st).length} suara sah`)
    if (done === actives(st).length) await resolveVoting(sock, st) // semua masuk -> langsung eliminasi / seri
  }

  // Jalur cadangan: dekripsi sendiri pesan suara mentah dari messages.upsert, mencoba kombinasi
  // JID (nomor / @lid) karena Baileys bisa gagal diam-diam di grup beralamat LID.
  function handleRawVote(sock, msg, pu) {
    const pollId = pu?.pollCreationMessageKey?.id
    const entry = pollId && pollIndex.get(pollId)
    if (!entry) return Promise.resolve()
    return locked(entry.gid, async () => {
      const st = entry.state
      if (!alive(st) || st.phase !== 'vote' || !st.poll || st.poll.id !== pollId) return
      const secret = st.poll.message?.messageContextInfo?.messageSecret
      if (!secret || !pu.vote?.encPayload) { log.warn('[undercover] suara mentah diterima tapi data polling tidak lengkap'); return }

      const me = [sock.user?.id, sock.user?.lid, sock.authState?.creds?.me?.lid, sock.authState?.creds?.me?.id]
      const creators = [...new Set(me.flatMap((j) => [j, normJid(j)]).filter(Boolean))]
      const k = msg.key || {}
      const voters = [...new Set((k.fromMe ? me : [k.participant, k.participantAlt]).flatMap((j) => [j, normJid(j)]).filter(Boolean))]
      for (const creator of creators) {
        for (const voter of voters) {
          let sel
          try { sel = decryptPollVote(pu.vote, { pollMsgId: pollId, creator, voter, secret }) } catch { continue }
          log.log('[undercover] suara polling berhasil didekripsi (jalur cadangan)')
          const ts = toMs(pu.senderTimestampMs)
          return applyVotes(sock, entry, pollId, [{ pollUpdateMessageKey: msg.key, vote: { selectedOptions: sel }, senderTimestampMs: ts }])
        }
      }
      log.warn('[undercover] suara polling diterima tapi GAGAL didekripsi (Baileys dan jalur cadangan sama-sama gagal)')
    })
  }

  async function resolveVoting(sock, st) {
    if (st.phase !== 'vote') return // pastikan hasil hanya diproses satu kali
    st.phase = 'resolving'
    if (st.poll) { pollIndex.delete(st.poll.id); st.poll = null }

    const counts = new Map()
    for (const p of actives(st)) {
      const v = st.votes.get(p.no)
      if (v?.target != null) counts.set(v.target, (counts.get(v.target) || 0) + 1)
    }
    const top = Math.max(0, ...counts.values())
    const leaders = [...counts].filter(([, c]) => c === top).map(([no]) => no)

    if (leaders.length !== 1) {
      await say(sock, st, box(`${T} — HASIL VOTING`, ['Hasil voting seri.', '', 'Tidak ada pemain yang dieliminasi.', 'Permainan berlanjut ke sesi berikutnya.']))
      return nextOrFinish(sock, st)
    }

    const out = st.players.find((p) => p.no === leaders[0])
    out.out = 'eliminated'
    await say(sock, st, box(`${T} — ELIMINASI`, [`${out.name} telah dieliminasi.`, '', `Peran: ${out.role === 'impostor' ? 'Impostor' : 'Civilian'}`]))
    if (!alive(st)) return

    if (out.role === 'impostor') return gameOver(sock, st, 'civilian', 'Impostor berhasil ditemukan.')
    if (twoLeft(st)) return gameOver(sock, st, 'impostor', 'Tersisa dua pemain. Civilian tidak bisa lagi menang lewat voting.')
    return nextOrFinish(sock, st)
  }

  // Tersisa 2 pemain aktif (Impostor + 1 Civilian): voting tidak mungkin menang, Impostor langsung menang.
  const twoLeft = (st) => actives(st).length <= 2 && actives(st).some((p) => p.role === 'impostor')

  async function nextOrFinish(sock, st) {
    if (!alive(st)) return
    if (st.session >= R.maxSessions) return gameOver(sock, st, 'impostor', 'Impostor berhasil bertahan hingga sesi terakhir.')
    st.session++
    await startSession(sock, st)
  }

  async function gameOver(sock, st, winner, note) {
    if (!(await sleep(st, R.gameOverDelayMs))) return
    const team = winner === 'civilian' ? 'CIVILIAN' : 'IMPOSTOR'
    const winners = st.players.filter((p) => p.role === winner && p.out !== 'kicked')
    const tag = (p) => '@' + String(dmJid(p)).split('@')[0]
    const msgLines = [`TEAM ${team} MENANG.`, '']
    if (winner === 'impostor') msgLines.push(`Kemenangan jatuh pada ${winners.map(tag).join(', ')}`)
    else msgLines.push('Kemenangan jatuh pada Team Civilian:', ...winners.map((p, k) => `${k + 1}. ${tag(p)}`))
    msgLines.push('', note)
    await say(sock, st, box(`${T} — GAME OVER`, msgLines), winners.map(dmJid)).catch((e) => log.error('[undercover] gagal kirim game over:', e?.message))
    kill(st) // reset total: state, polling, timer
  }

  // ---------- #ucstop (host saja, seketika) ----------
  async function cmdStop(sock, msg) {
    const gid = msg.key.remoteJid
    const st = groups.get(gid)
    if (!st || st.phase === 'lobby') return reply(sock, msg, box(T, ['Tidak ada permainan aktif.']))
    const me = findPlayer(st, senderIds(sock, msg))
    if (!me || me !== st.host) {
      return reply(sock, msg, box(T, ['Kamu bukan host permainan ini.', '', `Host saat ini: ${st.host?.name || '-'}`]))
    }
    kill(st) // sinkron: timer, polling, dan state langsung dibatalkan sebelum ada await
    return send(sock, gid, { text: box(T, ['Permainan dihentikan oleh host.', '', 'Gunakan #ucjoin dan #ucstart untuk game baru.']) })
      .catch((e) => log.error('[undercover] gagal kirim info stop:', e?.message))
  }

  // ---------- #uckick (host saja; untuk pemain yang keluar grup / tidak aktif) ----------
  async function cmdKick(sock, msg, args) {
    const gid = msg.key.remoteJid
    const st = groups.get(gid)
    if (!st || st.phase === 'lobby') return reply(sock, msg, box(T, ['Tidak ada permainan aktif.']))
    const me = findPlayer(st, senderIds(sock, msg))
    if (!me || me !== st.host) {
      return reply(sock, msg, box(T, ['Hanya host yang bisa mengeluarkan pemain.', '', `Host saat ini: ${st.host?.name || '-'}`]))
    }
    if (st.phase !== 'clue' && st.phase !== 'vote') return reply(sock, msg, box(T, ['Belum bisa saat ini. Coba lagi sebentar.']))

    const n = Number.parseInt(args[0], 10)
    if (!args[0]) {
      return reply(sock, msg, box(T, ['Pemain aktif:', ...actives(st).map((p) => `${p.no}. ${p.name}`), '', 'Ketik #uckick <nomor> untuk mengeluarkan pemain.']))
    }
    const target = st.players.find((p) => p.no === n && !p.out)
    if (!target) return reply(sock, msg, box(T, ['Nomor tidak valid.', 'Ketik #uckick untuk melihat daftar pemain aktif.']))
    if (target === st.host) return reply(sock, msg, box(T, ['Host tidak bisa mengeluarkan dirinya sendiri.', 'Gunakan #ucstop untuk menghentikan game.']))

    target.out = 'kicked'
    await say(sock, st, box(T, [`${target.name} dikeluarkan dari permainan oleh host.`]))
    if (!alive(st)) return

    if (target.role === 'impostor') {
      return gameOver(sock, st, 'civilian', 'Impostor dikeluarkan dari permainan.')
    }
    if (twoLeft(st)) return gameOver(sock, st, 'impostor', 'Tersisa dua pemain. Civilian tidak bisa lagi menang lewat voting.')
    if (actives(st).length < 2) {
      await say(sock, st, box(T, ['Pemain aktif kurang dari 2.', 'Permainan dihentikan.'])).catch(() => {})
      return kill(st)
    }

    if (st.phase === 'clue') {
      if (actives(st).every((p) => p.clued)) await startVoting(sock, st)
    } else {
      // polling lama dibatalkan; buat polling baru dengan daftar pemain terbaru, suara dihitung ulang
      await say(sock, st, box(T, ['Voting diulang dengan daftar pemain terbaru.']))
      await startVoting(sock, st)
    }
  }

  return {
    handleMessage,
    handlePollUpdates,
    noteSent,
    getStoredMessage: (key) => {
      const e = key?.id && pollIndex.get(key.id)
      return e?.state?.poll?.message
    },
    // khusus pengujian
    _state: (gid) => groups.get(gid),
    _isTracked: (pollId) => pollIndex.has(pollId),
  }
}

module.exports = createUndercover
module.exports.RULES = RULES
module.exports._internal = { normJid, textOf, sha256hex, decryptPollVote }
