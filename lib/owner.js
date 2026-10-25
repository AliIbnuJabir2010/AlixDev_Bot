// © Ali Ibnu Jabir - cek apakah pengirim pesan termasuk nomor owner terdaftar

// "0812-345", "+62 812 345", "62812345@s.whatsapp.net", "1234:5@lid" -> hanya digit sebelum @ / :
// Awalan 0 dianggap nomor Indonesia (0812... -> 62812...)
function normalize(v) {
  let d = String(v ?? '').split('@')[0].split(':')[0].replace(/\D/g, '')
  if (d.startsWith('0')) d = '62' + d.slice(1)
  return d
}

// owners: array nomor (atau ID @lid). Mengembalikan fungsi isOwner(msg)
function createOwnerCheck(owners = []) {
  const set = new Set(owners.map(normalize).filter(Boolean))

  // selfJid = nomor akun bot sendiri (sock.user.id). Pesan fromMe hanya dianggap owner
  // kalau nomor akun bot itu sendiri terdaftar di owners.
  return function isOwner(msg, selfJid) {
    const key = msg?.key || {}
    if (key.fromMe) return !!selfJid && set.has(normalize(selfJid))

    const jids = [key.participant, key.participantAlt]
    const chat = key.remoteJid || ''
    if (!chat.endsWith('@g.us') && !chat.endsWith('@broadcast')) jids.push(chat, key.remoteJidAlt)

    return jids.some((j) => j && set.has(normalize(j)))
  }
}

module.exports = { createOwnerCheck, normalize }
