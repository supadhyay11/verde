const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore")
const { v2 } = require("@google-cloud/translate")

// Verde speaks English and Spanish. Whatever someone writes (a chat message,
// a visit note, a "needs attention" note) is stored exactly as written, and
// these triggers add the other-language version next to it a moment later.
// Each screen then shows the reader's own language and keeps the original
// available in small grey text.
//
// Uses Google Cloud Translation (Basic) with the project's own credentials -
// no API key to manage.
const REGION = "us-central1"
const translate = new v2.Translate()

/** Returns { en, es } for a piece of text, written by someone in any
 * language. The language it was already in is kept verbatim. */
async function bothLanguages(text) {
  const [[toEs, metaEs], [toEn]] = await Promise.all([
    translate.translate(text, { to: "es", format: "text" }).then((r) => [[r[0], r[1]]]),
    translate.translate(text, { to: "en", format: "text" }).then((r) => [[r[0]]]),
  ])
  const src = metaEs?.data?.translations?.[0]?.detectedSourceLanguage || ""
  const srcIsEs = src.startsWith("es")
  const srcIsEn = src.startsWith("en")
  return {
    en: srcIsEn ? text : toEn,
    es: srcIsEs ? text : toEs,
    src: srcIsEs ? "es" : srcIsEn ? "en" : src,
  }
}

exports.onMessageCreatedTranslate = onDocumentCreated(
  { document: "messages/{messageId}", region: REGION },
  async (event) => {
    const data = event.data?.data()
    const text = (data?.text || "").trim()
    if (!text) return
    try {
      const tr = await bothLanguages(text)
      await event.data.ref.update({ translations: tr })
    } catch (err) {
      console.error("translate message failed", err)
    }
  }
)

// Job notes and the report's "needs attention" note.
exports.onJobNotesTranslate = onDocumentUpdated(
  { document: "jobs/{jobId}", region: REGION },
  async (event) => {
    const before = event.data?.before?.data() || {}
    const after = event.data?.after?.data() || {}
    const updates = {}

    const note = (after.notes || "").trim()
    if (note && note !== (before.notes || "").trim() && after.notesI18n?.orig !== note) {
      try {
        updates.notesI18n = { ...(await bothLanguages(note)), orig: note }
      } catch (err) {
        console.error("translate notes failed", err)
      }
    }

    const att = (after.report?.attentionNotes || "").trim()
    if (
      att &&
      att !== (before.report?.attentionNotes || "").trim() &&
      after.attentionNotesI18n?.orig !== att
    ) {
      try {
        updates.attentionNotesI18n = { ...(await bothLanguages(att)), orig: att }
      } catch (err) {
        console.error("translate attention note failed", err)
      }
    }

    if (Object.keys(updates).length) await event.data.after.ref.update(updates)
  }
)
