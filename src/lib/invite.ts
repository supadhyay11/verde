/** Shared helpers for inviting a property's customer to create their own
 * Verde owner account - used both from the Customers list (CustomersPage)
 * and from the job report send flow (JobDetailPage / JobReportPage), so the
 * link format and message copy stay identical everywhere they're built. */

/** Public sign-up link for a specific invite code - scanning the QR or
 * following a "Send Invite" link drops the customer straight onto the
 * owner sign-up tab with the code pre-filled. */
export function inviteLink(code: string): string {
  return `https://verde-gardener-app.web.app/signup?code=${encodeURIComponent(code)}`
}

export function inviteMessage(businessName: string | undefined, code: string): string {
  const who = businessName ? `${businessName} on ` : ""
  // The "Add to Home Screen" tip is deliberately short here - this same
  // message goes out over SMS too, where every extra character counts
  // toward the segment limit. The auto-sent invite email (see
  // functions/send-invite-email.js) has room for the fuller version with
  // step-by-step instructions.
  return `Hi! ${who}Verde has you set up to track your garden service online. Create your account here: ${inviteLink(code)} (invite code: ${code}). Tip: on iPhone, tap Share then "Add to Home Screen" for the best experience.`
}

const IS_IOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)

/** Builds an `sms:` link that actually pre-fills both the recipient and the
 * message body. iOS and Android disagree on how the body param is
 * separated from the phone number - iOS wants `sms:PHONE&body=...` (no
 * `?`), Android wants `sms:PHONE?body=...`. Getting this wrong doesn't
 * error, it just silently drops the phone number and opens a blank
 * compose screen with the text still filled in, which looks like "it
 * didn't pick up the number" rather than an obvious bug. */
export function smsLink(phone: string, body: string): string {
  const separator = IS_IOS ? "&" : "?"
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`
}
