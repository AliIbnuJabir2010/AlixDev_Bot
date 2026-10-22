/**
 * AlixDev Bot - template "Soalan" (kotak pertanyaan ala Instagram) dengan teks bebas
 * © Ali Ibnu Jabir - All Rights Reserved
 *
 * Foto template ada di assets/templates/ustad.jpg. Kotak pertanyaan di foto ditimpa
 * dengan kotak baru yang isinya teks dari pengguna.
 */
const fs = require('fs')
const path = require('path')
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas')
const sharp = require('sharp')
const { emojiFile, toParts } = require('./brat') // sekalian mendaftarkan font BratFont (Regular)

GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'LiberationSans-Bold.ttf'), 'BratBold')

const TEMPLATE = path.join(__dirname, '..', 'assets', 'templates', 'ustad.jpg')
const TW = 415 // ukuran template (px)
const TH = 739
const S = 2 // diperbesar 2x biar teks tajam

// posisi kotak asli di template (hasil ukur)
const BOX = { x: 47, y: 96, w: 322, headerH: 51, bodyH: 127, r: 10 }
const HEADER_BG = '#272526'
const BODY_PAD_X = 24
const MAX_EXTRA = 150 // kotak boleh memanjang ke bawah sebanyak ini kalau teks panjang

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

async function renderUstad(input) {
  if (!fs.existsSync(TEMPLATE)) throw new Error('Foto template belum ada (assets/templates/ustad.jpg)')

  const text = String(input).replace(/[ \t]+/g, ' ').trim().slice(0, 200)
  const canvas = createCanvas(TW * S, TH * S)
  const ctx = canvas.getContext('2d')

  // foto latar
  const bgBuf = await sharp(TEMPLATE).resize(TW * S, TH * S, { kernel: 'lanczos3' }).toBuffer()
  ctx.drawImage(await loadImage(bgBuf), 0, 0)

  // ---------- susun teks: cari ukuran font yang muat ----------
  const maxW = (BOX.w - BODY_PAD_X * 2) * S
  const paragraphs = text.split('\n')
  let fs_ = 22, lines = [], pitch = 0
  for (; fs_ >= 14; fs_ -= 1) {
    ctx.font = `${fs_ * S}px BratBold`
    const EMO = fs_ * S * 1.1
    const spaceW = ctx.measureText(' ').width
    const wordW = (parts) => parts.reduce((w, p) => w + (p.t === 'emo' ? EMO : ctx.measureText(p.v).width), 0)
    lines = []
    for (const para of paragraphs) {
      const words = para.split(' ').filter(Boolean).map(toParts)
      let cur = [], curW = 0
      for (const w of words) {
        const ww = wordW(w)
        if (cur.length && curW + spaceW + ww > maxW) { lines.push({ words: cur, w: curW }); cur = []; curW = 0 }
        curW += (cur.length ? spaceW : 0) + ww
        cur.push(w)
      }
      lines.push({ words: cur, w: curW })
    }
    pitch = fs_ * 1.22
    if (lines.length * pitch <= BOX.bodyH - 28) break // muat di kotak asli
  }
  const needed = lines.length * pitch + 28
  const bodyH = Math.min(BOX.bodyH + MAX_EXTRA, Math.max(BOX.bodyH, needed))

  // ---------- gambar kotak (sedikit lebih besar dari aslinya supaya menutup rapi) ----------
  const m = 1.5
  const bx = (BOX.x - m) * S, by = (BOX.y - m) * S
  const bw = (BOX.w + m * 2) * S, bh = (BOX.headerH + bodyH + m * 2) * S
  ctx.save()
  rr(ctx, bx, by, bw, bh, (BOX.r + m) * S); ctx.clip()
  ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, bw, bh)
  ctx.fillStyle = HEADER_BG; ctx.fillRect(bx, by, bw, (BOX.headerH + m) * S)
  ctx.restore()

  // judul "Soalan"
  ctx.fillStyle = '#ffffff'
  ctx.font = `${14 * S}px BratBold`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Soalan', (BOX.x + BOX.w / 2) * S, (BOX.y + 26.5) * S)
  ctx.textAlign = 'left'

  // isi teks (rata tengah)
  ctx.fillStyle = '#000000'
  ctx.font = `${fs_ * S}px BratBold`
  const EMO = fs_ * S * 1.1
  const spaceW = ctx.measureText(' ').width
  const bodyTop = (BOX.y + BOX.headerH) * S
  const blockH = lines.length * pitch * S
  const startY = bodyTop + (bodyH * S - blockH) / 2
  const emojis = []
  lines.forEach((ln, li) => {
    let x = (BOX.x + BOX.w / 2) * S - ln.w / 2
    const base = startY + li * pitch * S + fs_ * S * 0.98
    ln.words.forEach((w, wi) => {
      if (wi) x += spaceW
      for (const p of w) {
        if (p.t === 'emo') { emojis.push({ file: p.file, x, y: base - EMO * 0.84 }); x += EMO }
        else { ctx.fillText(p.v, x, base); x += ctx.measureText(p.v).width }
      }
    })
  })
  for (const e of emojis) ctx.drawImage(await loadImage(e.file), e.x, e.y, EMO, EMO)

  return sharp(canvas.toBuffer('image/png')).jpeg({ quality: 93 }).toBuffer()
}

module.exports = { renderUstad }
