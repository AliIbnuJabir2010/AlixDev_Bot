/**
 * AlixDev Bot - generator stiker gaya "brat"
 * © Ali Ibnu Jabir - All Rights Reserved
 *
 * Ciri khas: kotak putih (bisa diganti BG), teks hitam huruf kecil semua,
 * font ramping (mirip Arial Narrow), rata kiri, blok teks di tengah kotak
 * (teks pendek dibesarkan), agak blur. Emoji tampil gaya iPhone (Apple).
 *
 * Gambar emoji Apple TIDAK disimpan di repo ini, diambil dari paket npm
 * "emoji-datasource-apple" saat npm install. Hak cipta gambar emoji milik Apple.
 */
const fs = require('fs')
const path = require('path')
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas')
const sharp = require('sharp')

GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'LiberationSans-Regular.ttf'), 'BratFont')

// folder gambar emoji Apple (kalau paketnya belum ke-install, emoji dilewati)
let EMOJI_DIR = null
try {
  EMOJI_DIR = path.join(path.dirname(require.resolve('emoji-datasource-apple/package.json')), 'img', 'apple', '64')
  if (!fs.existsSync(EMOJI_DIR)) EMOJI_DIR = null
} catch {}

const SIZE = 512
const PAD = 30
const BG = '#FFFFFF'
const FG = '#000000'
const SQUASH = 0.8 // dipepetkan ke samping biar kayak Arial Narrow
const MAX_FONT = 330 // teks pendek dibesarkan, teks panjang otomatis mengecil
const MAX_FONT_EMOJI = 230 // gambar emoji cuma 64px, jangan dibesarkan terlalu jauh
const MIN_FONT = 22
const LINE_H = 1.08
const BLUR = 1.6
const EMO_SLOT = 1.04 // lebar slot emoji relatif ke ukuran font

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
const EMOJI_LIKE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u
// emoji yang gambarnya nggak ketemu dibuang (jangan digambar sebagai kotak kosong ▯)
const EMOJI_DROP = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u200D\uFE0F\u20E3\u2600-\u27BF\u2B00-\u2BFF]/u

// cari file emoji Apple untuk satu grapheme (null kalau bukan emoji / file nggak ada)
function emojiFile(g) {
  if (!EMOJI_DIR || !EMOJI_LIKE.test(g)) return null
  const cps = [...g].map((c) => c.codePointAt(0).toString(16))
  const noFe0f = cps.filter((c) => c !== 'fe0f')
  const cands = [cps.join('-'), noFe0f.join('-'), noFe0f[0] + '-fe0f']
  for (const c of cands) {
    const f = path.join(EMOJI_DIR, c + '.png')
    if (fs.existsSync(f)) return f
  }
  return null
}

// pecah kata jadi bagian teks / emoji
function toParts(word) {
  const parts = []
  for (const { segment } of segmenter.segment(word)) {
    const file = emojiFile(segment)
    if (file) parts.push({ t: 'emo', file })
    else if (EMOJI_DROP.test(segment)) continue
    else if (parts.length && parts[parts.length - 1].t === 'txt') parts[parts.length - 1].v += segment
    else parts.push({ t: 'txt', v: segment })
  }
  return parts
}

const imgCache = new Map()
async function getImage(file) {
  if (!imgCache.has(file)) imgCache.set(file, await loadImage(file))
  return imgCache.get(file)
}

async function makeBrat(input) {
  const text = String(input).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200)
  const words = text.split(' ').map(toParts)
  const hasEmoji = words.some((w) => w.some((p) => p.t === 'emo'))

  const canvas = createCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')
  const maxW = SIZE - PAD * 2
  const maxH = SIZE - PAD * 2

  // ukuran
  const wordW = (parts, size) =>
    parts.reduce((w, p) => w + (p.t === 'emo' ? size * EMO_SLOT : ctx.measureText(p.v).width * SQUASH), 0)
  const lineW = (line, size) => {
    const space = ctx.measureText(' ').width * SQUASH
    return line.reduce((w, wd, i) => w + wordW(wd, size) + (i ? space : 0), 0)
  }
  const wrap = (size) => {
    const lines = []
    let cur = []
    for (const w of words) {
      if (!cur.length || lineW([...cur, w], size) <= maxW) cur.push(w)
      else { lines.push(cur); cur = [w] }
    }
    if (cur.length) lines.push(cur)
    return lines
  }

  // cari font terbesar yang masih muat
  let size = hasEmoji ? MAX_FONT_EMOJI : MAX_FONT
  let lines = []
  for (; size >= MIN_FONT; size -= 2) {
    ctx.font = `${size}px BratFont`
    lines = wrap(size)
    const widest = Math.max(...lines.map((l) => lineW(l, size)))
    if (lines.length * size * LINE_H <= maxH && widest <= maxW) break
  }

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = FG
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${size}px BratFont`

  // blok teks di tengah kotak (baris tetap rata kiri di dalam blok)
  const ASC = size * 0.72 // tinggi huruf (tanpa turunan) dari garis dasar
  const blockH = (lines.length - 1) * size * LINE_H + ASC
  const blockW = Math.max(...lines.map((l) => lineW(l, size)))
  const x0 = (SIZE - blockW) / 2
  const y0 = (SIZE - blockH) / 2 + ASC
  const space = ctx.measureText(' ').width * SQUASH
  const E = size // ukuran gambar emoji

  for (let i = 0; i < lines.length; i++) {
    const base = y0 + i * size * LINE_H
    let x = x0
    for (let wi = 0; wi < lines[i].length; wi++) {
      if (wi) x += space
      for (const p of lines[i][wi]) {
        if (p.t === 'emo') {
          const img = await getImage(p.file)
          ctx.drawImage(img, x, base - E * 0.86, E, E)
          x += size * EMO_SLOT
        } else {
          ctx.save()
          ctx.translate(x, base)
          ctx.scale(SQUASH, 1)
          ctx.fillText(p.v, 0, 0)
          ctx.restore()
          x += ctx.measureText(p.v).width * SQUASH
        }
      }
    }
  }

  return sharp(canvas.toBuffer('image/png')).blur(BLUR).png().toBuffer()
}

module.exports = { makeBrat, emojiFile, toParts, emojiReady: !!EMOJI_DIR }
