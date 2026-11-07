import type { Lang } from './types'

// The invite goes out as a text message to the customer, so it is written in
// THEIR language (chosen when the gardener adds them), not the gardener's.

const ORIGIN = 'https://verde-gardener-app.web.app'

/** Sign-up link with the code and the customer's language already filled in. */
export function inviteLink(code: string, lang: Lang): string {
  return `${ORIGIN}/?code=${encodeURIComponent(code)}&lang=${lang}`
}

export function inviteMessage(gardener: string | undefined, code: string, lang: Lang): string {
  const link = inviteLink(code, lang)
  if (lang === 'es') {
    const who = gardener ? `${gardener} te invita a Verde` : 'Te invitamos a Verde'
    return `¡Hola! ${who} para ver tus servicios de jardín, fotos y mensajes. Crea tu cuenta aquí: ${link} (código: ${code})`
  }
  const who = gardener ? `${gardener} invites you to Verde` : 'You are invited to Verde'
  return `Hi! ${who} to see your garden visits, photos and messages. Create your account here: ${link} (code: ${code})`
}

const IS_IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

/** `sms:` link that pre-fills both the number and the text. iOS wants `&body=`, Android wants `?body=`. */
export function smsLink(phone: string, body: string): string {
  return `sms:${phone}${IS_IOS ? '&' : '?'}body=${encodeURIComponent(body)}`
}
