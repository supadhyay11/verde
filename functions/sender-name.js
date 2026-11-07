// RESEND_FROM_EMAIL is set up as "TadPool Invoices <invoices@...>" because
// invoices were its first use. Emails that aren't invoices (verification
// codes/links) reuse the same address but must show a neutral sender name,
// or a verification email arrives from "TadPool Invoices".
function withSenderName(from, name) {
  const m = /<([^>]+)>/.exec(from)
  const address = (m ? m[1] : from).trim()
  return `${name} <${address}>`
}
module.exports = { withSenderName }
