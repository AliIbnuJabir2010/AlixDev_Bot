# AlixDev Bot
WhatsApp bot simpel — © Ali Ibnu Jabir

## Jalankan
```bash
npm install
npm start
```
Perintah: `.menu` `.info` `.owner` `.play <judul lagu>` `.dl <link>` `.dls <link>` `.rvo` `.s` `.toimg` `.brat <teks>` `.iphone <teks> | <jam>` `.ustad <kata>` `.ig <teks>`
Khusus owner: `.off` / `.of` (matikan bot dari WA, balasan "Memverifikasi..." lalu diedit jadi berhasil/gagal)

Lisensi: lihat `LICENSE`. Dilarang edit/jual tanpa izin pemilik.

## .play
Butuh `yt-dlp` terpasang (`yt-dlp --version`). Opsional (variabel lingkungan): `YTDLP_PATH`, `YTDLP_COOKIES`, `PLAY_MAX_SECONDS`.

## Owner (.off)
Isi nomor owner di `config.owners` (index.js), atau lewat env `OWNER_NUMBERS=628111,628222`. Kalau bot dijalankan lewat pm2/nodemon, proses akan dinyalakan lagi otomatis setelah `.off`.
