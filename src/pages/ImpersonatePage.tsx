// Admin "view as provider" is not part of Verde. These two helpers stay so
// the auth context and shell keep working unchanged; they are always inert.
export function isImpersonatingSession() {
  return false
}

export function clearImpersonatingSession() {
  // no-op
}
