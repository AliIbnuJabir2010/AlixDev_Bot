/**
 * AlixDev Bot - generator tampilan chat iPhone (pesan + menu tahan lama)
 * © Ali Ibnu Jabir - All Rights Reserved
 *
 * Teks pesan dan jam bisa diisi bebas oleh pengguna. Emoji tampil gaya iPhone.
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas')
const sharp = require('sharp')
const { emojiFile, toParts } = require('./brat') // sekalian mendaftarkan font BratFont

const W = 900
const H = 1600
const FONT = 'BratFont'
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const MENU = [
  ['Balas', 'reply'], ['Teruskan', 'forward'], ['Salin', 'copy'], ['Beri Bintang', 'star'],
  ['Sematkan', 'pin'], ['Laporkan', 'warn'], ['Hapus', 'trash', true],
]

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// latar: wallpaper bawaan WhatsApp (terang / gelap) + gelembung chat, lalu di-blur dan digelapkan
const THEMES = {
  terang: { bg: '#efeae2', out: '#d9fdd3', inc: '#ffffff', doodle: 'rgba(0,0,0,0.07)', dim: 0.22 },
  gelap: { bg: '#0b141a', out: '#005c4b', inc: '#202c33', doodle: 'rgba(255,255,255,0.06)', dim: 0.32 },
}

function rng(seed) { // acak tetap (hasilnya selalu sama)
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// coretan kecil khas wallpaper WhatsApp
function doodle(x, kind, cx, cy, s) {
  x.beginPath()
  if (kind === 0) x.arc(cx, cy, s / 2, 0, Math.PI * 2)
  else if (kind === 1) { // hati
    x.moveTo(cx, cy + s / 2); x.bezierCurveTo(cx - s, cy - s / 4, cx - s / 3, cy - s, cx, cy - s / 4)
    x.bezierCurveTo(cx + s / 3, cy - s, cx + s, cy - s / 4, cx, cy + s / 2)
  } else if (kind === 2) { // bintang
    for (let i = 0; i < 10; i++) { const r = i % 2 ? s / 4 : s / 2, a = -Math.PI / 2 + (i * Math.PI) / 5; x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r) }
    x.closePath()
  } else if (kind === 3) { x.moveTo(cx - s / 2, cy); x.lineTo(cx + s / 2, cy); x.moveTo(cx, cy - s / 2); x.lineTo(cx, cy + s / 2) } // plus
  else if (kind === 4) { x.moveTo(cx - s / 2, cy); for (let i = 1; i <= 4; i++) x.quadraticCurveTo(cx - s / 2 + (i - 0.5) * (s / 4), cy + (i % 2 ? -s / 4 : s / 4), cx - s / 2 + i * (s / 4), cy) } // gelombang
  else { x.arc(cx - s / 4, cy, s / 4, Math.PI, 0); x.arc(cx + s / 4, cy, s / 4, Math.PI, 0); x.moveTo(cx - s / 2, cy); x.lineTo(cx + s / 2, cy) } // awan
  x.stroke()
}

async function wallpaper(themeName) {
  const t = THEMES[themeName] || THEMES.terang
  const c = createCanvas(W, H)
  const x = c.getContext('2d')
  x.fillStyle = t.bg; x.fillRect(0, 0, W, H)

  // pola coretan
  const rand = rng(7)
  x.strokeStyle = t.doodle; x.lineWidth = 3; x.lineCap = 'round'; x.lineJoin = 'round'
  for (let gy = 40; gy < H; gy += 78) for (let gx = 30 + ((gy / 78) % 2) * 40; gx < W; gx += 80) {
    doodle(x, Math.floor(rand() * 6), gx + rand() * 20, gy + rand() * 20, 22 + rand() * 14)
  }

  // gelembung chat (kanan = keluar/hijau, kiri = masuk/putih)
  const bubbles = [
    [250, 20, 600, 100, 'out'], [40, 150, 430, 80, 'inc'], [420, 260, 440, 100, 'out'], [40, 400, 560, 90, 'inc'],
    [300, 540, 560, 150, 'out'], [40, 760, 380, 80, 'inc'], [380, 880, 480, 100, 'out'], [40, 1020, 600, 110, 'inc'],
    [330, 1190, 520, 90, 'out'], [40, 1320, 440, 80, 'inc'], [260, 1440, 600, 110, 'out'],
  ]
  for (const [bx, by, bw, bh, kind] of bubbles) { x.fillStyle = t[kind]; rr(x, bx, by, bw, bh, 28); x.fill() }

  const blurred = await sharp(c.toBuffer('image/png')).blur(16).toBuffer()
  return { img: await loadImage(blurred), dim: t.dim }
}

function icon(ctx, name, cx, cy, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color
  ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath()
  if (name === 'reply' || name === 'forward') {
    const s = name === 'reply' ? 1 : -1
    ctx.moveTo(cx - 6 * s, cy - 14); ctx.lineTo(cx - 18 * s, cy - 2); ctx.lineTo(cx - 6 * s, cy + 10)
    ctx.moveTo(cx - 18 * s, cy - 2); ctx.lineTo(cx + 4 * s, cy - 2); ctx.quadraticCurveTo(cx + 18 * s, cy - 2, cx + 18 * s, cy + 12)
    ctx.stroke()
  } else if (name === 'copy') {
    rr(ctx, cx - 6, cy - 15, 20, 24, 4); ctx.stroke()
    rr(ctx, cx - 16, cy - 7, 20, 24, 4); ctx.stroke()
  } else if (name === 'star') {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 7 : 16, a = -Math.PI / 2 + (i * Math.PI) / 5
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + 1 + Math.sin(a) * r)
    }
    ctx.closePath(); ctx.stroke()
  } else if (name === 'pin') {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(0.6)
    rr(ctx, -7, -17, 14, 16, 3); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-12, -1); ctx.lineTo(12, -1); ctx.moveTo(0, -1); ctx.lineTo(0, 17); ctx.stroke()
    ctx.restore()
  } else if (name === 'warn') {
    ctx.moveTo(cx, cy - 16); ctx.lineTo(cx + 17, cy + 13); ctx.lineTo(cx - 17, cy + 13); ctx.closePath(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 3); ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, cy + 8.5, 1.6, 0, Math.PI * 2); ctx.fill()
  } else if (name === 'trash') {
    ctx.moveTo(cx - 15, cy - 8); ctx.lineTo(cx + 15, cy - 8)
    ctx.moveTo(cx - 5, cy - 8); ctx.lineTo(cx - 5, cy - 14); ctx.lineTo(cx + 5, cy - 14); ctx.lineTo(cx + 5, cy - 8)
    ctx.moveTo(cx - 11, cy - 8); ctx.lineTo(cx - 9, cy + 15); ctx.lineTo(cx + 9, cy + 15); ctx.lineTo(cx + 11, cy - 8)
    ctx.moveTo(cx - 3, cy - 2); ctx.lineTo(cx - 3, cy + 9); ctx.moveTo(cx + 3, cy - 2); ctx.lineTo(cx + 3, cy + 9)
    ctx.stroke()
  }
}

/**
 * @param {{ text: string, time: string, theme?: 'terang'|'gelap' }} o
 * @returns {Promise<Buffer>} JPEG
 */
async function renderIphoneChat({ text, time, theme = 'terang' }) {
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')
  const wp = await wallpaper(theme)
  ctx.drawImage(wp.img, 0, 0)
  ctx.fillStyle = `rgba(0,0,0,${wp.dim})`
  ctx.fillRect(0, 0, W, H)

  // ---------- ukur teks pesan ----------
  const FS = 38, LH = 52, PADX = 32, PADY = 24, MAXW = 640
  const innerMax = MAXW - PADX * 2
  ctx.font = `${FS}px ${FONT}`
  const EMO = FS * 1.12
  const partsW = (parts) => parts.reduce((w, p) => w + (p.t === 'emo' ? EMO : ctx.measureText(p.v).width), 0)
  const spaceW = ctx.measureText(' ').width

  const paragraphs = String(text).slice(0, 400).split('\n')
  const lines = []
  for (const para of paragraphs) {
    const words = para.split(' ').filter((w) => w.length).map(toParts)
    let cur = [], curW = 0
    for (const w of words) {
      const ww = partsW(w)
      if (cur.length && curW + spaceW + ww > innerMax) { lines.push({ words: cur, w: curW }); cur = []; curW = 0 }
      curW += (cur.length ? spaceW : 0) + ww
      cur.push(w)
    }
    lines.push({ words: cur, w: curW })
  }
  const widest = Math.max(...lines.map((l) => l.w), 0)
  ctx.font = `26px ${FONT}`
  const timeW = ctx.measureText(time).width
  const last = lines[lines.length - 1]
  const inline = last.w + 28 + timeW <= innerMax
  const contentW = Math.min(innerMax, Math.max(widest, inline ? last.w + 28 + timeW : timeW))
  const bubbleW = Math.max(260, contentW + PADX * 2)
  const bubbleH = PADY * 2 + lines.length * LH + (inline ? 0 : 34)

  // ---------- susun tata letak ----------
  const barH = 116, menuRowH = 86, menuW = 526
  const menuH = MENU.length * menuRowH
  const totalH = barH + 30 + bubbleH + 36 + menuH
  const top = Math.max(60, Math.min(560, H - 60 - totalH))
  const left = 50

  // ---------- bar reaksi ----------
  const barW = 655
  ctx.fillStyle = 'rgba(44,44,46,0.94)'
  rr(ctx, left, top, barW, barH, barH / 2); ctx.fill()
  for (let i = 0; i < REACTIONS.length; i++) {
    const f = emojiFile(REACTIONS[i])
    if (f) ctx.drawImage(await loadImage(f), left + 28 + 44 + i * 88 - 32, top + barH / 2 - 32, 64, 64)
  }
  const pcx = left + barW - 58, pcy = top + barH / 2
  ctx.fillStyle = '#636366'; ctx.beginPath(); ctx.arc(pcx, pcy, 38, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(pcx - 14, pcy); ctx.lineTo(pcx + 14, pcy); ctx.moveTo(pcx, pcy - 14); ctx.lineTo(pcx, pcy + 14); ctx.stroke()

  // ---------- gelembung pesan ----------
  const by = top + barH + 30
  ctx.fillStyle = 'rgba(28,28,30,0.97)'
  rr(ctx, left, by, bubbleW, bubbleH, 38); ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `${FS}px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  for (let li = 0; li < lines.length; li++) {
    let x = left + PADX
    const base = by + PADY + li * LH + FS
    lines[li].words.forEach((w, wi) => {
      if (wi) x += spaceW
      for (const p of w) {
        if (p.t === 'emo') { /* digambar di bawah */ p._x = x; p._b = base; x += EMO }
        else { ctx.fillText(p.v, x, base); x += ctx.measureText(p.v).width }
      }
    })
  }
  for (const l of lines) for (const w of l.words) for (const p of w) {
    if (p.t === 'emo') ctx.drawImage(await loadImage(p.file), p._x, p._b - EMO * 0.84, EMO, EMO)
  }
  ctx.fillStyle = '#8e8e93'
  ctx.font = `26px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(time, left + bubbleW - PADX + 4, by + bubbleH - PADY + (inline ? -2 : -4))
  ctx.textAlign = 'left'

  // ---------- menu tahan-lama ----------
  const my = by + bubbleH + 36
  ctx.fillStyle = 'rgba(44,44,46,0.95)'
  rr(ctx, left, my, menuW, menuH, 40); ctx.fill()
  MENU.forEach(([label, ic, danger], i) => {
    const ry = my + i * menuRowH
    const col = danger ? '#ff453a' : '#ffffff'
    if (i) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(left + 30, ry, menuW - 30, 2) }
    ctx.fillStyle = col
    ctx.font = `33px ${FONT}`
    ctx.textBaseline = 'middle'
    ctx.fillText(label, left + 32, ry + menuRowH / 2 + 1)
    icon(ctx, ic, left + menuW - 62, ry + menuRowH / 2, col)
  })

  return sharp(c.toBuffer('image/png')).jpeg({ quality: 92 }).toBuffer()
}

module.exports = { renderIphoneChat }
