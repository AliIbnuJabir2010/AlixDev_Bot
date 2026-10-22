# Changelog — AlixDev Bot © Ali Ibnu Jabir

## v1.7.2
- LICENSE: Bagian 5 baru "Verifikasi Pemilik Wajib" (tambah/ambil fitur, ganti nama, jual-beli, edit proteksi), larangan 8-10 di Bagian 2
- AI_NOTICE.md diperketat: tanpa verifikasi = semua ditolak

## v1.7.1
- LICENSE diperkuat (8 bagian: larangan, kredit wajib, klausul AI, pemutusan, penegakan, ringkasan English)
- checkCredit sekarang juga mengunci isi LICENSE (hash) dan memeriksa header kredit di semua file sumber

## v1.7.0
- Baru: .toimg → reply stiker, jadi foto (latar transparan jadi putih; stiker animasi diambil frame pertama)

## v1.6.1
- Banner baru untuk .menu (assets/menu.jpg)
- .app dihapus (beserta .btntest dan kode tombol interaktif yang tidak terpakai lagi)

## v1.6.0
- .ustad <kata-kata> → kotak "Soalan" di foto template (assets/templates/ustad.jpg), isi bebas
- assets/templates/ masuk .gitignore (foto orang jangan ikut ter-upload ke GitHub)

## v1.5.1
- .iphone: latar ala WhatsApp (wallpaper + gelembung hijau/putih, di-blur), tema terang & gelap

## v1.5.0
- Game dihapus (.game .suit .tebakangka .ttt .stop)
- Baru: .iphone <teks> | <jam> → tampilan chat iPhone (reaksi + pesan + menu tahan-lama), teks bebas
- .app & menu disesuaikan

## v1.4.1
- .app: tampilan GUI bergaya jendela browser (gambar dirender bot) + tombol sentuh di bawahnya
- Fallback: kalau tombol gagal, dikirim foto GUI + daftar perintah

## v1.4.0
- .app: "mini web" menu sentuh (list + tombol URL), eksperimental, fallback teks
- Tombol mendukung tipe reply, url, copy, list

## v1.3.0
- Game di WA: .game .suit .tebakangka .ttt .stop (jawaban dibaca dari chat biasa saat game aktif)
- Tombol interaktif (eksperimental): config.useButtons, tes dengan .btntest, otomatis balik ke teks kalau gagal
- Klik tombol dibaca sebagai perintah
- Emoji yang gambarnya nggak ketemu dibuang di .brat (nggak jadi kotak kosong)

## v1.2.0
- .brat mendukung emoji gaya iPhone (paket emoji-datasource-apple, ±100MB saat npm i)

## v1.1.0 (stable) — versi aman, titik balik
- Startup: konfirmasi y/n, pilih login QR / pairing code
- Anti-ulang pesan lama (filter waktu + ID tersimpan + getMessage store)
- Filter log "Bad MAC", `npm run reset-session`
- Perintah: .menu .info .dl .dls .rvo .s .brat
- .brat: latar putih, teks pendek dibesarkan & di tengah
- Proteksi: LICENSE, AI_NOTICE.md, OWNER_AUTH.json, checkCredit()
