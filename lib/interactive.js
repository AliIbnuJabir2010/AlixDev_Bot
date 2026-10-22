/**
 * AlixDev Bot - pesan interaktif (tombol "rich message")
 * © Ali Ibnu Jabir - All Rights Reserved
 *
 * Baileys bawaan TIDAK bisa kirim tombol: WhatsApp minta node tambahan (biz/interactive/native_flow).
 * Di sini node itu disuntik lewat opsi resmi `additionalNodes`, tanpa paket fork pihak ketiga.
 * CATATAN: WhatsApp sering ubah aturan tombol buat akun biasa, jadi fitur ini EKSPERIMENTAL.
 */

// Jenis tombol: reply (default), url, copy, list (menu geser-pilih)
function toNative(b) {
  switch (b.type) {
    case 'url':
      return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: b.text, url: b.url, merchant_url: b.url }) }
    case 'copy':
      return { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: b.text, copy_code: b.code }) }
    case 'list':
      return {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: b.text,
          sections: b.sections.map((sec) => ({
            title: sec.title,
            rows: sec.rows.map((r) => ({ title: r.title, description: r.description || '', id: r.id })),
          })),
        }),
      }
    default:
      return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }) }
  }
}

async function sendNativeButtons({ sock, wa, jid, title, text, footer, buttons, quoted, image }) {
  if (!wa?.generateWAMessageFromContent || !wa?.proto) throw new Error('Baileys belum siap')
  const { generateWAMessageFromContent, proto } = wa
  const IM = proto.Message.InteractiveMessage

  const nativeButtons = buttons.map(toNative)

  // header bergambar (upload gambar dulu ke server WhatsApp)
  let header = null
  if (image) {
    if (!wa.prepareWAMessageMedia) throw new Error('prepareWAMessageMedia tidak tersedia')
    const media = await wa.prepareWAMessageMedia({ image }, { upload: sock.waUploadToServer })
    header = IM.Header.create({ title: title || '', hasMediaAttachment: true, imageMessage: media.imageMessage })
  } else if (title) {
    header = IM.Header.create({ title, hasMediaAttachment: false })
  }

  const content = {
    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
    interactiveMessage: IM.create({
      ...(header ? { header } : {}),
      body: IM.Body.create({ text }),
      footer: IM.Footer.create({ text: footer || '' }),
      nativeFlowMessage: IM.NativeFlowMessage.create({ buttons: nativeButtons }),
    }),
  }

  const msg = generateWAMessageFromContent(jid, content, { userJid: sock.user.id, quoted })

  const additionalNodes = [
    {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'interactive',
          attrs: { type: 'native_flow', v: '1' },
          content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
        },
      ],
    },
  ]
  // chat pribadi butuh node bot tambahan, grup tidak
  if (!jid.endsWith('@g.us')) additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } })

  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes })
  sock.remember?.(msg)
  return msg
}

module.exports = { sendNativeButtons, toNative }
