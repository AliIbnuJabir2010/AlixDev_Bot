// © Ali Ibnu Jabir - SIMULASI game Undercover (socket palsu, BUKAN pengujian WhatsApp nyata)
// Jalankan: node tests/undercover.sim.js
'use strict'
const assert = require('assert')
const crypto = require('crypto')
const createUndercover = require('../lib/undercover')

const sha = (s) => crypto.createHash('sha256').update(s).digest()
const quiet = { error() {}, warn() {}, log() {} }

function makeEnv(seed = 1) {
  let s = seed
  const rng = (n) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n }
  const sock = {
    sent: [], failFor: new Set(), n: 0,
    user: { id: '6280000000:1@s.whatsapp.net', name: 'Bot' },
    async sendMessage(jid, content, opts) {
      if (this.failFor.has(jid)) throw new Error('gagal kirim')
      const id = 'M' + ++this.n
      this.sent.push({ jid, content, opts, id })
      const message = content.poll ? { pollCreationMessage: content.poll, messageContextInfo: { messageSecret: 'x' } } : { conversation: content.text }
      return { key: { remoteJid: jid, fromMe: true, id }, message }
    },
    async groupMetadata() { return { participants: [] } },
  }
  const uc = createUndercover({ rules: { dmDelayMs: 0, gameOverDelayMs: 0, selfSendSettleMs: 0 }, rng, log: quiet })
  let mid = 0
  const jidOf = (name) => `62${crypto.createHash('md5').update(name).digest('hex').replace(/\D/g, '').slice(0, 9)}@s.whatsapp.net`
  const say = (g, name, text, extra = {}) =>
    uc.handleMessage(sock, { key: { remoteJid: g, participant: jidOf(name), fromMe: false, id: 'T' + ++mid, ...extra }, pushName: name, message: { conversation: text } })
  const lastPoll = (g) => [...sock.sent].reverse().find((m) => m.jid === g && m.content.poll)
  const vote = (g, name, label, poll = lastPoll(g)) =>
    uc.handlePollUpdates(sock, [{
      key: { remoteJid: g, fromMe: true, id: poll.id },
      update: { pollUpdates: [{ pollUpdateMessageKey: { remoteJid: g, participant: jidOf(name), fromMe: false, id: 'V' + ++mid }, vote: { selectedOptions: label ? [sha(label)] : [] }, senderTimestampMs: Date.now() + mid }] },
    }])
  const texts = (g) => sock.sent.filter((m) => m.jid === g && m.content.text).map((m) => m.content.text)
  const lastText = (g) => texts(g).at(-1) || ''
  const dms = (name) => sock.sent.filter((m) => m.jid === jidOf(name)).map((m) => m.content.text)
  const roleOf = (g, name) => uc._state(g).players.find((p) => p.name === name).role
  return { uc, sock, say, vote, lastPoll, texts, lastText, dms, roleOf, jidOf }
}

async function joinAll(e, g, names) { for (const n of names) await e.say(g, n, '#ucjoin') }
async function startGame(e, g, names, host = names[0]) { await joinAll(e, g, names); await e.say(g, host, '#ucstart') }
async function clueAll(e, g, names) { for (const n of names) await e.say(g, n, 'clue ' + n) }
const results = []
async function t(name, fn) {
  try { await fn(); results.push(['OK  ', name]) } catch (err) { results.push(['GAGAL', name + ' -> ' + err.message]); process.exitCode = 1 }
}

;(async () => {
  const G = '111@g.us', G2 = '222@g.us'
  const P = ['Ali', 'Budi', 'Citra']

  await t('1. tiga pemain bergabung dan game mulai', async () => {
    const e = makeEnv(); await startGame(e, G, P)
    assert.strictEqual(e.uc._state(G).phase, 'clue')
    assert(e.texts(G).some((x) => x.includes('Oke, game berjalan.') && x.includes('Host: Ali') && x.includes('Pemain: 3')))
    assert(e.texts(G).some((x) => x.includes('SESI 1')))
  })

  await t('2. dua pemain mencoba start -> ditolak', async () => {
    const e = makeEnv(); await joinAll(e, G, ['Ali', 'Budi']); await e.say(G, 'Ali', '#ucstart')
    assert(e.lastText(G).includes('Pemain kurang'))
    assert.strictEqual(e.uc._state(G).phase, 'lobby')
  })

  await t('3. pemain sama join berulang', async () => {
    const e = makeEnv(); await e.say(G, 'Ali', '#ucjoin'); await e.say(G, 'Ali', '#ucjoin')
    assert(e.lastText(G).includes('sudah terdaftar')); assert.strictEqual(e.uc._state(G).players.length, 1)
  })

  await t('3b. batas 10 pemain & join setelah game mulai ditolak', async () => {
    const e = makeEnv(); await joinAll(e, G, 'ABCDEFGHIJK'.split('').map((c) => 'P' + c))
    assert.strictEqual(e.uc._state(G).players.length, 10); assert(e.lastText(G).includes('Lobi penuh'))
    const e2 = makeEnv(); await startGame(e2, G, P); await e2.say(G, 'Dodi', '#ucjoin')
    assert(e2.lastText(G).includes('Game sedang berlangsung')); assert.strictEqual(e2.uc._state(G).players.length, 3)
  })

  await t('4. pemain kedua #ucstart saat game aktif -> ditolak + nama host; dua #ucstart bersamaan', async () => {
    const e = makeEnv(); await joinAll(e, G, P)
    await Promise.all([e.say(G, 'Ali', '#ucstart'), e.say(G, 'Budi', '#ucstart')])
    const st = e.uc._state(G)
    assert.strictEqual(st.host.name, 'Ali'); assert.strictEqual(e.texts(G).filter((x) => x.includes('Oke, game berjalan')).length, 1)
    assert(e.lastText(G).includes('Host saat ini: Ali') || e.texts(G).some((x) => x.includes('Host saat ini: Ali')))
  })

  await t('5+6. bukan host #ucstop ditolak; host #ucstop menghentikan & state dihapus', async () => {
    const e = makeEnv(); await startGame(e, G, P)
    await e.say(G, 'Budi', '#ucstop'); assert(e.lastText(G).includes('Kamu bukan host')); assert(e.uc._state(G))
    await e.say(G, 'Ali', '#ucstop'); assert.strictEqual(e.uc._state(G), undefined)
    await startGame(e, G, P, 'Budi'); assert.strictEqual(e.uc._state(G).host.name, 'Budi') // game baru, state baru
  })

  await t('7. semua pemain menerima kata via chat pribadi (hanya kata, tanpa peran)', async () => {
    const e = makeEnv(); await startGame(e, G, P)
    for (const n of P) { const d = e.dms(n); assert.strictEqual(d.length, 1); assert(/^[A-Z ]+$/.test(d[0])); assert(!/civilian|impostor/i.test(d[0])) }
    assert(!e.texts(G).some((x) => P.some((n) => x.includes(e.dms(n)[0]) && e.dms(n)[0].length > 2 && !x.includes('Peran'))))
    const words = P.map((n) => e.dms(n)[0]); assert.strictEqual(new Set(words).size, 2) // 2 civilian sama, 1 impostor beda
  })

  await t('8. satu DM gagal -> game batal, kembali ke lobi, kata tidak diumumkan', async () => {
    const e = makeEnv(); await joinAll(e, G, P); e.sock.failFor.add(e.jidOf('Budi')); await e.say(G, 'Ali', '#ucstart')
    const st = e.uc._state(G); assert.strictEqual(st.phase, 'lobby'); assert.strictEqual(st.host, null)
    assert(e.lastText(G).includes('Budi') && e.lastText(G).includes('belum bisa dimulai'))
    assert(!e.texts(G).some((x) => x.includes('SESI 1')))
    assert(e.dms('Ali').at(-1).includes('dibatalkan')) // yang sempat menerima disuruh abaikan
    e.sock.failFor.clear(); await e.say(G, 'Ali', '#ucstart'); assert.strictEqual(e.uc._state(G).phase, 'clue') // bisa ulang
  })

  await t('9+10. petunjuk: duplikat/non-peserta/>3 kata tidak dihitung; polling dibuat setelah semua petunjuk', async () => {
    const e = makeEnv(); await startGame(e, G, P)
    await e.say(G, 'Ali', 'satu dua tiga empat'); assert(!e.uc._state(G).players[0].clued) // >3 kata
    assert(e.lastText(G).includes('maksimal 3 kata'))
    await e.say(G, 'Ali', 'berbulu'); await e.say(G, 'Ali', 'lagi')
    await e.say(G, 'Zed', 'halo') // bukan peserta
    await e.say(G, 'Budi', '.menu'); await e.say(G, 'Budi', '#apa') // command lain bukan petunjuk
    assert.strictEqual(e.lastPoll(G), undefined)
    await e.say(G, 'Budi', 'galak'); assert.strictEqual(e.lastPoll(G), undefined)
    await e.say(G, 'Citra', 'imut'); assert(e.lastPoll(G)); assert.strictEqual(e.uc._state(G).phase, 'vote')
    assert.deepStrictEqual(e.lastPoll(G).content.poll.values, P); assert.strictEqual(e.lastPoll(G).content.poll.selectableCount, 1)
  })

  await t('9b. pesan sebelum sesi dimulai tidak dihitung', async () => {
    const e = makeEnv(); await joinAll(e, G, P)
    const p = e.say(G, 'Ali', '#ucstart'); const early = e.say(G, 'Budi', 'ok') // tiba saat game masih "starting"
    await Promise.all([p, early])
    assert(e.uc._state(G).players.every((x) => !x.clued))
  })

  await t('11+12+13. voting: non-peserta & tereliminasi tidak dihitung, hasil diproses sekali', async () => {
    const e = makeEnv(); const names = ['Ali', 'Budi', 'Citra', 'Dodi']; await startGame(e, G, names); await clueAll(e, G, names)
    const poll = e.lastPoll(G)
    await e.vote(G, 'Zed', 'Ali') // bukan peserta
    assert.strictEqual(e.uc._state(G).votes.size, 0)
    await e.vote(G, 'Ali', 'Ali') // pilih diri sendiri ditolak
    assert(e.lastText(G).includes('tidak boleh memilih diri sendiri')); assert.strictEqual(e.uc._state(G).votes.get(1).target, null)
    // Dodi dipilih 3 suara -> tereliminasi
    await e.vote(G, 'Ali', 'Dodi'); await e.vote(G, 'Budi', 'Dodi'); await e.vote(G, 'Citra', 'Dodi'); await e.vote(G, 'Dodi', 'Ali')
    const n1 = e.texts(G).filter((x) => x.includes('ELIMINASI') || x.includes('GAME OVER')).length
    await e.vote(G, 'Dodi', 'Ali', poll) // event duplikat/telat setelah selesai
    assert.strictEqual(e.texts(G).filter((x) => x.includes('ELIMINASI') || x.includes('GAME OVER')).length, n1)
    assert.strictEqual(n1 >= 1, true)
  })

  await t('13b. pemain tereliminasi tidak bisa memberi petunjuk/suara di sesi berikut', async () => {
    const e = makeEnv(); const names = ['Ali', 'Budi', 'Citra', 'Dodi']; await startGame(e, G, names)
    const civ = names.find((n) => e.roleOf(G, n) === 'civilian'); const rest = names.filter((n) => n !== civ)
    await clueAll(e, G, names)
    for (const n of rest) await e.vote(G, n, civ); await e.vote(G, civ, rest[0])
    assert.strictEqual(e.uc._state(G).session, 2); assert(e.texts(G).some((x) => x.includes(`${civ} telah dieliminasi`) && x.includes('Peran: Civilian')))
    await e.say(G, civ, 'masih ikut'); assert(!e.uc._state(G).players.find((p) => p.name === civ).clued)
    await clueAll(e, G, rest); const poll2 = e.lastPoll(G); assert(!poll2.content.poll.values.includes(civ))
    await e.vote(G, civ, rest[0]); assert.strictEqual(e.uc._state(G).votes.size, 0)
  })

  await t('14. hasil seri -> tidak ada eliminasi, lanjut sesi 2, tanpa voting ulang', async () => {
    const e = makeEnv(); await startGame(e, G, P); await clueAll(e, G, P)
    await e.vote(G, 'Ali', 'Budi'); await e.vote(G, 'Budi', 'Citra'); await e.vote(G, 'Citra', 'Ali')
    assert(e.texts(G).some((x) => x.includes('Hasil voting seri.')))
    assert.strictEqual(e.uc._state(G).session, 2); assert.strictEqual(e.uc._state(G).phase, 'clue')
    assert(e.uc._state(G).players.every((p) => !p.out))
  })

  await t('15. civilian tereliminasi: 4 pemain lanjut sesi 2; 3 pemain -> sisa 2, impostor langsung menang', async () => {
    const e = makeEnv(); const N = ['Ali', 'Budi', 'Citra', 'Dodi']; await startGame(e, G, N); await clueAll(e, G, N)
    const civ = N.find((n) => e.roleOf(G, n) === 'civilian'); const o = N.filter((n) => n !== civ)
    for (const n of o) await e.vote(G, n, civ); await e.vote(G, civ, o[0])
    assert.strictEqual(e.uc._state(G).session, 2)
    const e2 = makeEnv(); await startGame(e2, G, P); await clueAll(e2, G, P)
    const c2 = P.find((n) => e2.roleOf(G, n) === 'civilian'); const o2 = P.filter((n) => n !== c2)
    for (const n of o2) await e2.vote(G, n, c2); await e2.vote(G, c2, o2[0])
    assert(e2.texts(G).some((x) => x.includes('Peran: Civilian')))
    assert(e2.lastText(G).includes('TEAM IMPOSTOR MENANG.')); assert.strictEqual(e2.uc._state(G), undefined)
  })

  await t('16. impostor tereliminasi -> civilian menang, state dibersihkan', async () => {
    const e = makeEnv(); await startGame(e, G, P); await clueAll(e, G, P)
    const imp = P.find((n) => e.roleOf(G, n) === 'impostor'); const o = P.filter((n) => n !== imp)
    for (const n of o) await e.vote(G, n, imp); await e.vote(G, imp, o[0])
    const tx = e.texts(G); assert(tx.some((x) => x.includes('Peran: Impostor')))
    assert(tx.at(-1).includes('TEAM CIVILIAN MENANG.')); assert.strictEqual(e.uc._state(G), undefined)
    assert(tx.findIndex((x) => x.includes('ELIMINASI')) < tx.findIndex((x) => x.includes('GAME OVER'))) // eliminasi dulu
  })

  await t('17. impostor bertahan hingga sesi 3 -> impostor menang', async () => {
    const e = makeEnv(); await startGame(e, G, P)
    for (let s = 1; s <= 3; s++) {
      await clueAll(e, G, P); await e.vote(G, 'Ali', 'Budi'); await e.vote(G, 'Budi', 'Citra'); await e.vote(G, 'Citra', 'Ali') // seri terus
    }
    assert(e.lastText(G).includes('TEAM IMPOSTOR MENANG.')); assert.strictEqual(e.uc._state(G), undefined)
  })

  await t('18. dua grup berjalan bersamaan tanpa berbagi data', async () => {
    const e = makeEnv(); await Promise.all([startGame(e, G, P, 'Ali'), startGame(e, G2, ['Ali', 'Budi', 'Citra', 'Dodi'], 'Dodi')])
    const a = e.uc._state(G), b = e.uc._state(G2)
    assert.notStrictEqual(a, b); assert.strictEqual(a.players.length, 3); assert.strictEqual(b.players.length, 4)
    assert.strictEqual(a.host.name, 'Ali'); assert.strictEqual(b.host.name, 'Dodi')
    await e.say(G, 'Ali', '#ucstop'); assert.strictEqual(e.uc._state(G), undefined); assert(e.uc._state(G2))
  })

  await t('19. game selesai lalu grup memulai game baru dengan state baru', async () => {
    const e = makeEnv(); await startGame(e, G, P); await clueAll(e, G, P)
    const imp = P.find((n) => e.roleOf(G, n) === 'impostor'); const o = P.filter((n) => n !== imp)
    for (const n of o) await e.vote(G, n, imp); await e.vote(G, imp, o[0])
    assert.strictEqual(e.uc._state(G), undefined)
    await startGame(e, G, P, 'Citra'); const st = e.uc._state(G)
    assert.strictEqual(st.host.name, 'Citra'); assert.strictEqual(st.session, 1); assert(st.players.every((p) => !p.out && !p.clued))
  })

  await t('20. event polling game lama setelah stop / game baru diabaikan', async () => {
    const e = makeEnv(); await startGame(e, G, P); await clueAll(e, G, P); const old = e.lastPoll(G)
    await e.say(G, 'Ali', '#ucstop'); assert(!e.uc._isTracked(old.id))
    await e.vote(G, 'Ali', 'Budi', old); await e.vote(G, 'Budi', 'Citra', old); await e.vote(G, 'Citra', 'Ali', old)
    assert.strictEqual(e.uc._state(G), undefined)
    await startGame(e, G, P); await clueAll(e, G, P)
    await e.vote(G, 'Ali', 'Budi', old); await e.vote(G, 'Budi', 'Citra', old); await e.vote(G, 'Citra', 'Ali', old)
    assert.strictEqual(e.uc._state(G).votes.size, 0); assert.strictEqual(e.uc._state(G).session, 1)
  })

  await t('tambahan: #ucstop saat jeda game over membatalkan pengumuman tertunda', async () => {
    const e = makeEnv(); const sock = e.sock; let mid = 0
    const uc2 = createUndercover({ rules: { dmDelayMs: 0, gameOverDelayMs: 150, selfSendSettleMs: 0 }, rng: () => 0, log: quiet })
    const say = (n, text) => uc2.handleMessage(sock, { key: { remoteJid: G, participant: e.jidOf(n), fromMe: false, id: 'X' + ++mid }, pushName: n, message: { conversation: text } })
    for (const n of P) await say(n, '#ucjoin'); await say('Ali', '#ucstart')
    for (const n of P) await say(n, 'c')
    const poll = [...sock.sent].reverse().find((m) => m.content.poll)
    const vt = (n, l) => uc2.handlePollUpdates(sock, [{ key: { remoteJid: G, id: poll.id }, update: { pollUpdates: [{ pollUpdateMessageKey: { participant: e.jidOf(n), id: 'V' + ++mid }, vote: { selectedOptions: [sha(l)] }, senderTimestampMs: mid }] } }])
    // rng=0 -> Ali impostor. Budi & Citra memilih Ali; Ali memilih Budi.
    await vt('Budi', 'Ali'); await vt('Citra', 'Ali')
    const last = vt('Ali', 'Budi') // memicu eliminasi lalu jeda 150ms sebelum GAME OVER (tidak di-await)
    await new Promise((r) => setTimeout(r, 40))
    assert(sock.sent.some((m) => m.content.text && m.content.text.includes('ELIMINASI')))
    await say('Ali', '#ucstop')
    await last; await new Promise((r) => setTimeout(r, 250))
    assert(!sock.sent.some((m) => m.content.text && m.content.text.includes('GAME OVER')), 'GAME OVER tetap terkirim setelah stop')
    assert.strictEqual(uc2._state(G), undefined)
  })

  await t('tambahan: #uckick -> polling lama dibatalkan & dibuat ulang; non-host ditolak', async () => {
    const e = makeEnv(); const names = ['Ali', 'Budi', 'Citra', 'Dodi']; await startGame(e, G, names); await clueAll(e, G, names)
    const old = e.lastPoll(G)
    await e.say(G, 'Budi', '#uckick 4'); assert(e.lastText(G).includes('Hanya host'))
    await e.say(G, 'Ali', '#uckick 4')
    const target = e.uc._state(G).players[3]; assert.strictEqual(target.out, 'kicked')
    if (target.role === 'impostor') { assert(e.lastText(G).includes('TEAM CIVILIAN MENANG.')); return }
    const fresh = e.lastPoll(G); assert.notStrictEqual(fresh.id, old.id); assert.deepStrictEqual(fresh.content.poll.values, ['Ali', 'Budi', 'Citra'])
    assert(!e.uc._isTracked(old.id)); assert.strictEqual(e.uc._state(G).votes.size, 0)
  })

  await t('tambahan: pesan fromMe buatan bot tidak dihitung sebagai petunjuk', async () => {
    const e = makeEnv(); const botJid = e.sock.user.id
    await e.uc.handleMessage(e.sock, { key: { remoteJid: G, fromMe: true, id: 'B1' }, pushName: 'Bot', message: { conversation: '#ucjoin' } })
    for (const n of ['Budi', 'Citra']) await e.say(G, n, '#ucjoin')
    await e.uc.handleMessage(e.sock, { key: { remoteJid: G, fromMe: true, id: 'B2' }, message: { conversation: '#ucstart' } })
    const st = e.uc._state(G); assert.strictEqual(st.phase, 'clue')
    e.uc.noteSent({ key: { id: 'BOTREPLY' } })
    await e.uc.handleMessage(e.sock, { key: { remoteJid: G, fromMe: true, id: 'BOTREPLY' }, message: { conversation: 'balasan bot' } })
    assert(!st.players[0].clued)
    await e.uc.handleMessage(e.sock, { key: { remoteJid: G, fromMe: true, id: 'HUMAN' }, message: { conversation: 'ketikan manual' } })
    assert(st.players[0].clued); assert(botJid)
  })

  await t('tambahan: GAME OVER menyebut pemenang dengan @mention', async () => {
    const N = ['Ali', 'Budi', 'Citra', 'Dodi']
    const e = makeEnv(); await startGame(e, G, N); await clueAll(e, G, N)
    const imp = N.find((n) => e.roleOf(G, n) === 'impostor'); const o = N.filter((n) => n !== imp)
    for (const n of o) await e.vote(G, n, imp); await e.vote(G, imp, o[0])
    const go = e.sock.sent.filter((m) => m.jid === G && m.content.text?.includes('GAME OVER')).at(-1)
    assert(go.content.text.includes('TEAM CIVILIAN MENANG.') && go.content.text.includes('Kemenangan jatuh pada Team Civilian:'))
    assert.strictEqual(go.content.mentions.length, 3); assert(!go.content.mentions.includes(e.jidOf(imp)))
    for (const [i, n] of o.entries()) { const num = e.jidOf(n).split('@')[0]; assert(go.content.text.includes(`${i + 1}. @${num}`)); assert(go.content.mentions.includes(e.jidOf(n))) }
    const e2 = makeEnv(); await startGame(e2, G, P); await clueAll(e2, G, P)
    const c = P.find((n) => e2.roleOf(G, n) === 'civilian'); const r = P.filter((n) => n !== c)
    const imp2 = P.find((n) => e2.roleOf(G, n) === 'impostor')
    for (const n of r) await e2.vote(G, n, c); await e2.vote(G, c, r[0])
    const go2 = e2.sock.sent.filter((m) => m.jid === G && m.content.text?.includes('GAME OVER')).at(-1)
    assert(go2.content.text.includes(`Kemenangan jatuh pada @${e2.jidOf(imp2).split('@')[0]}`)); assert.deepStrictEqual(go2.content.mentions, [e2.jidOf(imp2)])
  })

  await t('tambahan: #ucvote sudah dihapus (tidak ada voting manual)', async () => {
    const e = makeEnv(); await startGame(e, G, P); await clueAll(e, G, P)
    assert(!e.texts(G).some((x) => x.includes('#ucvote')))
    await e.say(G, 'Ali', '#ucvote 2'); assert.strictEqual(e.uc._state(G).votes.size, 0)
  })

  await t('tambahan: suara mentah terenkripsi (jalur cadangan), JID creator @lid & voter nomor', async () => {
    const e = makeEnv(); e.sock.user.lid = '9990:1@lid'
    await startGame(e, G, P); await clueAll(e, G, P)
    const poll = e.lastPoll(G); const secret = Buffer.from('rahasia-polling-32-byte-rahasia!!')
    e.uc._state(G).poll.message = { messageContextInfo: { messageSecret: secret } }
    const bin = (x) => Buffer.from(x)
    const enc = (voterName, label, creator) => {
      const voter = e.jidOf(voterName), id = poll.id
      const sign = Buffer.concat([bin(id), bin(creator), bin(voter), bin('Poll Vote'), Buffer.from([1])])
      const k0 = crypto.createHmac('sha256', Buffer.alloc(32)).update(secret).digest()
      const key = crypto.createHmac('sha256', k0).update(sign).digest()
      const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); c.setAAD(bin(`${id}\u0000${voter}`))
      const h = sha(label); const pb = Buffer.concat([Buffer.from([0x0a, h.length]), h])
      const ct = Buffer.concat([c.update(pb), c.final(), c.getAuthTag()])
      return { encPayload: ct, encIv: iv }
    }
    const raw = (n, label) => e.uc.handleMessage(e.sock, { key: { remoteJid: G, participant: e.jidOf(n), fromMe: false, id: 'R' + ++e.sock.n }, message: { pollUpdateMessage: { pollCreationMessageKey: { remoteJid: G, fromMe: true, id: poll.id }, vote: enc(n, label, '9990@lid'), senderTimestampMs: Date.now() } } })
    const imp = P.find((n) => e.roleOf(G, n) === 'impostor'); const o = P.filter((n) => n !== imp)
    await raw(o[0], imp); await raw(o[1], imp); assert.strictEqual(e.uc._state(G).votes.size, 2)
    await raw(imp, o[0])
    assert(e.lastText(G).includes('TEAM CIVILIAN MENANG.'))
  })

  for (const [s, n] of results) console.log(s, n)
  const bad = results.filter((r) => r[0] === 'GAGAL').length
  console.log(`\n${results.length - bad}/${results.length} skenario lolos (SIMULASI, bukan uji WhatsApp nyata)`)
})()
