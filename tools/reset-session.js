// © Ali Ibnu Jabir - hapus sesi login (dipakai kalau muncul error Bad MAC)
// Jalankan: npm run reset-session  (pastikan bot sudah dimatikan dulu)
const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '..', 'session')
if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('✅ Folder session dihapus. Jalankan npm start lalu login ulang.')
} else {
  console.log('Folder session nggak ada, aman.')
}
