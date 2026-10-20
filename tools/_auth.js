// © Ali Ibnu Jabir - helper verifikasi pemilik
const crypto = require('crypto')
const readline = require('readline')
const path = require('path')

exports.FILE = path.join(__dirname, '..', 'OWNER_AUTH.json')
exports.QUESTIONS = [
  { key: 'nama', q: 'Siapa nama lengkap developer?' },
  { key: 'hobi', q: 'Apa hobi developer?' },
  { key: 'lahir', q: 'Tanggal, bulan, tahun lahir developer? (contoh: 01-01-2000)' },
]

const text = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const date = (s) => s.replace(/\D/g, '') // 18-10-2010 / 18/10/2010 / 18 10 2010 -> 18102010

// Semua jawaban digabung jadi SATU hash
exports.combine = ({ nama, hobi, lahir }) => [text(nama), text(hobi), date(lahir)].join('|')
exports.hash = (combined, salt) =>
  crypto.scryptSync(combined, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const lines = []
let waiting = null
rl.on('line', (l) => { waiting ? waiting(l) : lines.push(l); waiting = null })
rl.on('close', () => { if (waiting) waiting('') })
exports.ask = (q) => new Promise((r) => {
  process.stdout.write(q + ' ')
  if (lines.length) r(lines.shift()); else waiting = r
})
exports.done = () => rl.close()
