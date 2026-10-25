/**
 * AlixDev Bot - pesan error yang aman & enak dibaca di chat
 * © Ali Ibnu Jabir - All Rights Reserved
 *
 * UserError = error yang memang boleh tampil di chat (pesannya sudah ramah).
 * Error lain (bug, path file, dsb) TIDAK dikirim ke chat; detailnya cuma muncul di terminal bot.
 */
class UserError extends Error {}

const GAGAL = [
  (c) => `Woy bro, ${c} lagi error nih. Coba lagi bentar ya`,
  (c) => `Eh sorry bro, aku lagi ngadat pas ${c}. Ulangin lagi bentar ya`,
  (c) => `Yah, ${c} nya lagi bermasalah. Coba lagi nanti ya bro`,
]

function pesanGagal(err, label) {
  if (err instanceof UserError) return err.message
  return GAGAL[Math.floor(Math.random() * GAGAL.length)](label)
}

module.exports = { UserError, pesanGagal }
