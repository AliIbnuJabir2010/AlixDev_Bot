/**
 * AlixDev Bot - .play (cari lagu di YouTube lalu ambil audionya lewat yt-dlp)
 * © Ali Ibnu Jabir - All Rights Reserved
 *
 * Butuh yt-dlp terpasang (cek: yt-dlp --version). ffmpeg hanya dipakai kalau
 * audio yang didapat bukan m4a (untuk diubah ke mp3).
 *
 * Variabel lingkungan (opsional):
 *   YTDLP_PATH         lokasi yt-dlp kalau tidak ada di PATH
 *   YTDLP_COOKIES      lokasi file cookies.txt (kalau YouTube minta "sign in")
 *   PLAY_MAX_SECONDS   batas durasi lagu, default 600 (10 menit)
 */
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { UserError } = require('./usererror')

const BIN = process.env.YTDLP_PATH || 'yt-dlp'
const MAX_SECONDS = Number(process.env.PLAY_MAX_SECONDS) || 600
const MAX_ACTIVE = 2
const YT_URL_RE = /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}\S*/i
const VIDEO_ID_RE = /^[\w-]{11}$/

let active = 0

// execFile (bukan exec) → teks pengguna tidak pernah lewat shell
function run(bin, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) { err.stderr = String(stderr || ''); return reject(err) }
      resolve(String(stdout))
    })
  })
}

function baseArgs() {
  const a = ['--ignore-config', '--no-warnings', '--no-playlist']
  if (process.env.YTDLP_COOKIES) a.push('--cookies', process.env.YTDLP_COOKIES)
  return a
}

function friendly(err) {
  // cetak error asli yt-dlp ke terminal bot supaya gampang dilacak
  const raw = String(err.stderr || err.message || '').trim().split('\n').slice(-6).join('\n')
  console.error('[play] yt-dlp error:\n' + raw)
  const s = raw.toLowerCase()
  if (err.code === 'ENOENT') return new UserError('Waduh, mesin download lagunya belum kepasang nih, kabarin owner ya')
  if (err.killed || err.signal === 'SIGTERM') return new UserError('Kelamaan nunggunya bro ⏳, coba lagi bentar ya')
  if (s.includes('sign in to confirm') || s.includes('not a bot')) return new UserError('YouTube lagi nge-blok bot nih, coba lagi nanti ya')
  if (s.includes('video unavailable') || s.includes('private video')) return new UserError('Videonya gak bisa dibuka bro, coba lagu lain ya')
  if (s.includes('postprocessing') || s.includes('splitting the argument list') || s.includes('ffmpeg')) return new UserError('Converter audionya lagi bermasalah, kabarin owner ya')
  if (s.includes('larger than max-filesize') || s.includes('max-filesize')) return new UserError('Filenya kegedean bro, cari yang lebih pendek ya')
  if (s.includes('requested format') || s.includes('javascript runtime') || s.includes('js runtime')) return new UserError('Audionya gak bisa diambil, kabarin owner ya')
  if (s.includes('http error 403') || s.includes('unable to extract')) return new UserError('Downloadernya lagi usang nih, kabarin owner ya')
  return new UserError('Yah aku gagal ambil lagunya, coba lagi ya')
}

// Cari lagu (atau baca link YouTube) → { id, title, channel, duration, url }
async function searchSong(query) {
  const link = query.match(YT_URL_RE)?.[0]
  const target = link || 'ytsearch1:' + query
  let out
  try {
    out = await run(BIN, [...baseArgs(), '-j', '--skip-download', target], 45000)
  } catch (e) { throw friendly(e) }

  const line = out.split('\n').map((l) => l.trim()).filter(Boolean)[0]
  if (!line) throw new UserError('Lagunya gak ketemu bro, coba judul lain ya')
  let j
  try { j = JSON.parse(line) } catch { throw new UserError('Lagunya gak ketemu bro, coba judul lain ya') }
  const info = j.entries ? j.entries[0] : j
  if (!info || !VIDEO_ID_RE.test(info.id || '')) throw new UserError('Lagunya gak ketemu bro, coba judul lain ya')
  return {
    id: info.id,
    title: info.track ? `${info.artist || info.uploader || ''} - ${info.track}`.replace(/^ - /, '') : info.title || '-',
    channel: info.channel || info.uploader || '-',
    duration: Number(info.duration) || 0,
    url: 'https://www.youtube.com/watch?v=' + info.id,
  }
}

// Unduh audio → { buffer, mimetype }. File sementara selalu dihapus.
async function fetchAudio(id) {
  if (!VIDEO_ID_RE.test(id)) throw new UserError('Link videonya gak valid bro')
  if (active >= MAX_ACTIVE) throw new UserError('Lagi rame nih bro, tunggu bentar ya')
  active++
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alixplay-'))
  try {
    try {
      await run(BIN, [
        ...baseArgs(),
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '--max-filesize', '30M',
        '-o', path.join(dir, '%(id)s.%(ext)s'),
        'https://www.youtube.com/watch?v=' + id,
      ], 180000)
    } catch (e) { throw friendly(e) }

    const file = fs.readdirSync(dir).find((f) => !f.endsWith('.part'))
    if (!file) throw new UserError('Audionya gak ketemu bro')
    let full = path.join(dir, file)
    let ext = path.extname(file).slice(1).toLowerCase()

    // WhatsApp tidak stabil memutar webm/opus → ubah ke mp3 kalau perlu
    if (ext !== 'm4a' && ext !== 'mp3') {
      const mp3 = path.join(dir, id + '.mp3')
      try {
        await run('ffmpeg', ['-y', '-i', full, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', mp3], 120000)
      } catch (e) {
        throw new UserError(e.code === 'ENOENT' ? 'Converter audionya belum kepasang nih, kabarin owner ya' : 'Yah gagal ngubah audionya, coba lagi ya')
      }
      full = mp3
      ext = 'mp3'
    }
    return { buffer: fs.readFileSync(full), mimetype: ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg' }
  } finally {
    active--
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

const fmtDuration = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

module.exports = { searchSong, fetchAudio, fmtDuration, MAX_SECONDS }
