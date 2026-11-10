// One-off: removes the first-version Verde test login so it can sign up
// again on the new app. Deletes only this one Auth user and its users/{uid}
// profile document.
const { initializeApp } = require("firebase-admin/app")
const { getAuth } = require("firebase-admin/auth")
const { getFirestore } = require("firebase-admin/firestore")

initializeApp({ projectId: "verde-gardener-app" })
;(async () => {
  const email = "shailu.it11@gmail.com"
  let user
  try {
    user = await getAuth().getUserByEmail(email)
  } catch (e) {
    console.log("No Auth user found for that email - nothing to delete.", e.code)
    return
  }
  await getFirestore().doc(`users/${user.uid}`).delete()
  await getAuth().deleteUser(user.uid)
  console.log("Deleted the old test login and its profile document.")
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
