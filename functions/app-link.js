// The link to the published TadPool iOS app, added to the customer-facing
// emails (service report, invoice, weekly sign-up reminder). One place to
// change it.
//
// Leave this empty to switch the "get the app" block off everywhere: every
// helper below returns nothing when there's no valid link, so an email never
// goes out with a blank or broken one.
//
// It must be the https App Store page, e.g.
//   https://apps.apple.com/us/app/tadpool/id0000000000
const APP_STORE_URL = "https://apps.apple.com/us/app/tadpool/id6811681021"

function validUrl(url) {
  return typeof url === "string" && /^https:\/\/apps\.apple\.com\/\S+$/.test(url.trim())
}

function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c])
}

/**
 * Lines to splice into a plain-text email body (already includes the blank
 * line before it). Empty array when no valid link is configured.
 *   lead: the sentence that introduces the link.
 * `url` is overridable only so the output can be tested.
 */
function appLinkTextLines(lead = "Get the TadPool app:", url = APP_STORE_URL) {
  if (!validUrl(url)) return []
  return ["", `${lead} ${url.trim()}`]
}

/**
 * Small, muted HTML paragraph for an HTML email. Empty string when no valid
 * link is configured.
 */
function appLinkHtml(lead = "Get the TadPool app:", url = APP_STORE_URL) {
  if (!validUrl(url)) return ""
  const href = escapeAttr(url.trim())
  return (
    `<p style="font-size:13px;color:#555555;margin:16px 0 0;">${escapeAttr(lead)} ` +
    `<a href="${href}" style="color:#0369a1;font-weight:600;text-decoration:underline;">Download on the App Store</a></p>`
  )
}

module.exports = { APP_STORE_URL, appLinkTextLines, appLinkHtml }
