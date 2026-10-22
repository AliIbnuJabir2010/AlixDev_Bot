/**
 * AlixDev Bot - gambar tampilan "GUI web" untuk pesan interaktif
 * © Ali Ibnu Jabir - All Rights Reserved
 *
 * Dirender jadi gambar (jendela browser + kartu menu), lalu dikirim sebagai header pesan
 * dengan tombol yang bisa disentuh di bawahnya.
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas')
const { emojiFile } = require('./brat') // sekalian mendaftarkan font BratFont

const W = 1000
const H = 640
const FONT = 'BratFont'

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * @param {{ botName: string, url?: string, subtitle?: string, tiles: {icon?: string, label: string}[], footer?: string }} o
 */
async function renderHome(o) {
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')

  // latar
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0b1020')
  bg.addColorStop(1, '#1b2340')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // bar jendela ala browser
  ctx.fillStyle = '#151c34'
  ctx.fillRect(0, 0, W, 64)
  ;[['#ff5f57', 36], ['#febc2e', 66], ['#28c840', 96]].forEach(([col, x]) => {
    ctx.fillStyle = col
    ctx.beginPath(); ctx.arc(x, 32, 9, 0, Math.PI * 2); ctx.fill()
  })
  ctx.fillStyle = '#0b1020'
  rr(ctx, 150, 14, 700, 36, 18); ctx.fill()
  ctx.fillStyle = '#8b97b8'
  ctx.font = `20px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.fillText(o.url || 'alixdev.app / home', 176, 33)

  // judul
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.font = `64px ${FONT}`
  ctx.fillText(o.botName, 56, 150)
  ctx.fillStyle = '#9aa7c7'
  ctx.font = `26px ${FONT}`
  ctx.fillText(o.subtitle || 'Sentuh menu di bawah, nggak perlu ngetik', 58, 192)

  // kartu menu (3 kolom)
  const cols = 3
  const gap = 24
  const tw = (W - 56 * 2 - gap * (cols - 1)) / cols
  const th = 150
  const top = 232
  for (let i = 0; i < o.tiles.length && i < 6; i++) {
    const t = o.tiles[i]
    const x = 56 + (i % cols) * (tw + gap)
    const y = top + Math.floor(i / cols) * (th + gap)
    ctx.fillStyle = '#26304f'
    rr(ctx, x, y, tw, th, 22); ctx.fill()
    ctx.strokeStyle = '#34406a'; ctx.lineWidth = 2
    rr(ctx, x, y, tw, th, 22); ctx.stroke()

    const file = t.icon && emojiFile(t.icon)
    if (file) ctx.drawImage(await loadImage(file), x + 24, y + 24, 56, 56)
    ctx.fillStyle = '#ffffff'
    ctx.font = `30px ${FONT}`
    ctx.fillText(t.label, x + 24, y + 124)
  }

  // footer
  ctx.fillStyle = '#6f7ba3'
  ctx.font = `22px ${FONT}`
  ctx.fillText(o.footer || '', 56, H - 28)

  return c.toBuffer('image/png')
}

module.exports = { renderHome }
