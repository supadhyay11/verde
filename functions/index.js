// Verde Cloud Functions.
//
//  - translateMessage: every new chat message is translated into the other
//    language (English <-> Spanish) and stored next to the original.
//  - translateJobText: the job description (gardener -> customer) and the
//    report note are translated the same way.
//  - linkToProvider: a customer types a 6-character code (the gardener's own,
//    or one made for that customer) and is linked to that gardener. Done here, not in the app, so a customer can
//    never attach themselves to someone else by editing their own profile.
//
// Translation uses the Cloud Translation API (basic edition) with the
// function's own service account, so there is no API key to manage.

const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { v2 } = require('@google-cloud/translate');

initializeApp();
const db = getFirestore();
const translator = new v2.Translate();

const REGION = 'us-central1';
const LANGS = ['en', 'es'];
const otherLang = (l) => (l === 'en' ? 'es' : 'en');

async function translateText(text, from, to) {
  const [out] = await translator.translate(text, { from, to, format: 'text' });
  return out;
}

exports.translateMessage = onDocumentCreated(
  { document: 'threads/{threadId}/messages/{messageId}', region: REGION, retry: false },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { text, lang } = snap.data();
    if (typeof text !== 'string' || !LANGS.includes(lang)) return;
    const target = otherLang(lang);
    try {
      const out = await translateText(text, lang, target);
      await snap.ref.update({ translations: { [lang]: text, [target]: out } });
    } catch (err) {
      logger.error('translateMessage failed', { path: snap.ref.path, message: err.message });
      // The app shows the original text and stops saying "Translating…".
      await snap.ref.update({ translationFailed: true });
    }
  },
);

exports.translateJobText = onDocumentWritten(
  { document: 'jobs/{jobId}', region: REGION, retry: false },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists) return;
    const before = event.data.before && event.data.before.exists ? event.data.before.data() : {};
    const job = after.data();
    const updates = {};

    const pairs = [
      ['description', 'descriptionLang', 'descriptionTranslations'],
      ['note', 'noteLang', 'noteTranslations'],
    ];
    for (const [textField, langField, outField] of pairs) {
      const text = job[textField];
      const lang = job[langField];
      if (typeof text !== 'string' || !text.trim() || !LANGS.includes(lang)) continue;
      const target = otherLang(lang);
      const have = job[outField] && job[outField][target];
      const changed = before[textField] !== text;
      if (have && !changed) continue; // already translated, nothing new to do
      try {
        updates[outField] = { [lang]: text, [target]: await translateText(text, lang, target) };
      } catch (err) {
        logger.error('translateJobText failed', { path: after.ref.path, field: textField, message: err.message });
      }
    }
    if (Object.keys(updates).length) await after.ref.update(updates);
  },
);

exports.linkToProvider = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const code = String((request.data && request.data.code) || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Bad code.');

  const meRef = db.doc(`users/${request.auth.uid}`);
  const me = await meRef.get();
  if (!me.exists || me.data().role !== 'customer') {
    throw new HttpsError('failed-precondition', 'Only customer accounts can link to a gardener.');
  }

  // 1) A code the gardener made for one specific customer they added by hand:
  //    link this account to that gardener and move that customer's jobs over.
  const rec = await db.collection('providerCustomers').where('code', '==', code).limit(1).get();
  if (!rec.empty) {
    const recDoc = rec.docs[0];
    const r = recDoc.data();
    if (r.claimedBy && r.claimedBy !== request.auth.uid) {
      throw new HttpsError('already-exists', 'That code was already used.');
    }
    const jobs = await db.collection('jobs').where('providerId', '==', r.providerId).where('customerId', '==', recDoc.id).get();
    const batch = db.batch();
    jobs.docs.forEach((j) => batch.update(j.ref, { customerId: request.auth.uid }));
    const invs = await db.collection('invoices').where('providerId', '==', r.providerId).where('customerId', '==', recDoc.id).get();
    invs.docs.forEach((i) => batch.update(i.ref, { customerId: request.auth.uid }));
    batch.update(meRef, { providerId: r.providerId });
    batch.update(recDoc.ref, { claimedBy: request.auth.uid });
    await batch.commit();
    return { ok: true };
  }

  // 2) The gardener's own general code.
  const found = await db.collection('users').where('inviteCode', '==', code).where('role', '==', 'provider').limit(1).get();
  if (found.empty) throw new HttpsError('not-found', 'No gardener has that code.');

  await meRef.update({ providerId: found.docs[0].id });
  return { ok: true };
});

// deleteMyAccount: the signed-in person deletes their own account and data.
//  - Gardener: their profile, customers, jobs (and job photos) and chats go;
//    customers who were linked to them are simply unlinked.
//  - Customer: their profile and chat go; the gardener keeps the job history
//    (names only) and the customer card goes back to "not in the app yet".
exports.deleteMyAccount = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = request.auth.uid;
  const meRef = db.doc(`users/${uid}`);
  const me = await meRef.get();
  const role = me.exists ? me.data().role : null;

  const deleteQuery = async (q) => {
    const snap = await q.get();
    for (const d of snap.docs) await db.recursiveDelete(d.ref);
  };

  if (role === 'provider') {
    await deleteQuery(db.collection('jobs').where('providerId', '==', uid));
    await deleteQuery(db.collection('invoices').where('providerId', '==', uid));
    await deleteQuery(db.collection('providerCustomers').where('providerId', '==', uid));
    await deleteQuery(db.collection('threads').where('providerId', '==', uid));
    const linked = await db.collection('users').where('providerId', '==', uid).get();
    for (const d of linked.docs) await d.ref.update({ providerId: FieldValue.delete() });
    await db.doc(`providerProfiles/${uid}`).delete().catch(() => {});
    try { await getStorage().bucket().deleteFiles({ prefix: `jobs/${uid}/` }); } catch (err) { logger.warn('photo cleanup failed', err.message); }
  } else if (role === 'customer') {
    await deleteQuery(db.collection('threads').where('customerId', '==', uid));
    const claimed = await db.collection('providerCustomers').where('claimedBy', '==', uid).get();
    for (const d of claimed.docs) await d.ref.update({ claimedBy: FieldValue.delete() });
  }

  await meRef.delete().catch(() => {});
  await getAuth().deleteUser(uid);
  return { ok: true };
});

// sendShareEmail: the gardener emails a customer an invite, a service report
// or an invoice. Sent through Resend (same service as Tadpool), written in the
// customer's language. The customer never needs the app: the email carries a
// link that opens without signing in. Checks that the caller owns the record.
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const RESEND_FROM_EMAIL = defineSecret('RESEND_FROM_EMAIL');
const ORIGIN = 'https://verde-gardener-app.web.app';

const MAIL = {
  en: {
    hi: (n) => `Hi ${n || 'there'}!`,
    inviteSubject: 'Your Verde invitation',
    inviteBody: (who, link, code) => `${who} invites you to Verde to see your garden visits, photos and messages.\n\nCreate your account here: ${link}\n\nYour code: ${code}`,
    reportSubject: 'Your garden service report',
    reportBody: (who, link) => `${who} finished your garden visit. See the report and photos here (no app or account needed):\n\n${link}`,
    invoiceSubject: (n) => `Invoice #${n}`,
    invoiceBody: (who, amount, period, link) => `${who} sent you an invoice for ${amount} (${period}).\n\nSee it and how to pay (Zelle or Venmo) here:\n\n${link}`,
  },
  es: {
    hi: (n) => `¡Hola${n ? ' ' + n : ''}!`,
    inviteSubject: 'Tu invitación a Verde',
    inviteBody: (who, link, code) => `${who} te invita a Verde para ver tus visitas de jardín, fotos y mensajes.\n\nCrea tu cuenta aquí: ${link}\n\nTu código: ${code}`,
    reportSubject: 'Tu reporte de servicio de jardín',
    reportBody: (who, link) => `${who} terminó la visita a tu jardín. Mira el reporte y las fotos aquí (no necesitas app ni cuenta):\n\n${link}`,
    invoiceSubject: (n) => `Factura #${n}`,
    invoiceBody: (who, amount, period, link) => `${who} te envió una factura por ${amount} (${period}).\n\nMírala y mira cómo pagar (Zelle o Venmo) aquí:\n\n${link}`,
  },
};

async function resendSend({ apiKey, from, to, subject, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

exports.sendShareEmail = onCall({ region: REGION, secrets: [RESEND_API_KEY, RESEND_FROM_EMAIL] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = request.auth.uid;
  const kind = request.data && request.data.kind;
  const id = request.data && request.data.id;
  if (!['invite', 'report', 'invoice'].includes(kind) || typeof id !== 'string' || !id) {
    throw new HttpsError('invalid-argument', 'Bad request.');
  }

  const me = await db.doc(`users/${uid}`).get();
  if (!me.exists || me.data().role !== 'provider') throw new HttpsError('permission-denied', 'Gardeners only.');
  const gardener = me.data().name || 'Your gardener';

  // The customer behind a job/invoice is either a hand-added record or a signed-up account.
  const contactFor = async (customerId) => {
    const rec = await db.doc(`providerCustomers/${customerId}`).get();
    if (rec.exists && rec.data().providerId === uid) return { name: rec.data().name, email: rec.data().email };
    const u = await db.doc(`users/${customerId}`).get();
    if (u.exists && u.data().providerId === uid) return { name: u.data().name, email: u.data().email };
    return null;
  };

  let to, lang, subject, body, name;
  if (kind === 'invite') {
    const snap = await db.doc(`providerCustomers/${id}`).get();
    if (!snap.exists || snap.data().providerId !== uid) throw new HttpsError('not-found', 'Customer not found.');
    const r = snap.data();
    if (r.claimedBy) throw new HttpsError('failed-precondition', 'Already joined.');
    to = r.email; name = r.name; lang = LANGS.includes(r.language) ? r.language : 'en';
    const m = MAIL[lang];
    subject = m.inviteSubject;
    body = m.inviteBody(gardener, `${ORIGIN}/?code=${r.code}&lang=${lang}`, r.code);
  } else if (kind === 'report') {
    const snap = await db.doc(`jobs/${id}`).get();
    if (!snap.exists || snap.data().providerId !== uid) throw new HttpsError('not-found', 'Job not found.');
    const j = snap.data();
    if (!j.reportSentAt) throw new HttpsError('failed-precondition', 'Send the report first.');
    const c = await contactFor(j.customerId);
    to = c && c.email; name = (c && c.name) || j.customerName; lang = LANGS.includes(j.customerLang) ? j.customerLang : 'en';
    const m = MAIL[lang];
    subject = m.reportSubject;
    body = m.reportBody(gardener, `${ORIGIN}/report/${id}`);
  } else {
    const snap = await db.doc(`invoices/${id}`).get();
    if (!snap.exists || snap.data().providerId !== uid) throw new HttpsError('not-found', 'Invoice not found.');
    const inv = snap.data();
    const c = await contactFor(inv.customerId);
    to = c && c.email; name = (c && c.name) || inv.customerName; lang = LANGS.includes(inv.customerLang) ? inv.customerLang : 'en';
    const m = MAIL[lang];
    const amount = new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format(inv.amount);
    subject = m.invoiceSubject(inv.number);
    body = m.invoiceBody(gardener, amount, inv.period, `${ORIGIN}/invoice/${id}`);
  }

  if (!to) throw new HttpsError('failed-precondition', 'This customer has no email on file.');
  const apiKey = (RESEND_API_KEY.value() || '').trim();
  const from = (RESEND_FROM_EMAIL.value() || '').trim();
  if (!apiKey || !from) throw new HttpsError('failed-precondition', 'Email is not set up yet.');

  try {
    await resendSend({ apiKey, from, to, subject, text: `${MAIL[lang].hi(name)}\n\n${body}` });
  } catch (err) {
    logger.error('sendShareEmail failed', { kind, message: err.message });
    throw new HttpsError('internal', 'Could not send the email.');
  }
  return { ok: true };
});
