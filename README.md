# Verde

Jobs, photo reports, chat and payments for gardeners and landscapers and their customers, in English and Spanish. Every user sees one language only, chosen at signup. Chat messages, job descriptions and report notes are translated automatically; the original is shown in small grey text.

Separate from Tadpool: own repo, own Firebase / Google Cloud project.

## Stack
- Web app (installable on a phone): React, TypeScript, Vite, Tailwind, `src/`
- Backend: Firebase Auth, Firestore, Storage, Hosting, Cloud Functions v2 (Node 20) in `functions/`
- Translation: Google Cloud Translation API, called from the functions with their own service account (no API key)

## How it deploys
Pushing to `main` deploys everything from GitHub Actions, nothing runs from a laptop.
- `.github/workflows/deploy.yml`: builds and publishes the web app to Firebase Hosting.
- `.github/workflows/deploy-backend.yml`: publishes functions, Firestore rules and indexes, Storage rules when those files change.
- One repo secret is needed: `FIREBASE_SERVICE_ACCOUNT` (the service account JSON). Never commit secrets. The Firebase web config in `.env.production` is public by design.

## Data
- `users/{uid}`: role (`provider` or `customer`), language, name, contact, `inviteCode` (gardeners), `providerId` (customers)
- `providerProfiles/{uid}`: what customers may see of a gardener: name, language, phone, Zelle, Venmo
- `jobs/{id}`: customer, address, date and time, checklist, photos, note, payment
- `threads/{providerId_customerId}/messages/{id}`: chat, with `translations` filled in by a function

Payments are Zelle and Venmo only. The gardener marks a job as paid; there is no card processing.

## Local development
```
npm install
cp .env.example .env     # fill in the Firebase web config
npm run dev
```
