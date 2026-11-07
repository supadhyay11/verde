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
