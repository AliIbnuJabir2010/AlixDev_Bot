// © Ali Ibnu Jabir - verifikasi otorisasi pemilik: npm run verify-owner
const fs = require('fs')
const { FILE, QUESTIONS, combine, hash, ask, done } = require('./_auth')

;(async () => {
  if (!fs.existsSync(FILE)) {
    done()
    console.log('❌ OWNER_AUTH.json tidak ditemukan. Edit TIDAK diizinkan.')
    process.exit(1)
  }
  const { salt, hash: stored } = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  const ans = {}
  for (const { key, q } of QUESTIONS) ans[key] = await ask(q)
  done()
  if (hash(combine(ans), salt) !== stored) {
    console.log('\n⛔ Verifikasi gagal. Perubahan TIDAK diizinkan. © Ali Ibnu Jabir')
    process.exit(1)
  }
  console.log('\n✅ Verifikasi pemilik berhasil. Edit diizinkan, kredit "Ali Ibnu Jabir" tetap tidak boleh dihapus.')
})()
