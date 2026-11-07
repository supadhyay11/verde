export interface AddressParts {
  street: string
  city: string
  state: string
  zip: string
}

export const EMPTY_ADDRESS: AddressParts = { street: "", city: "", state: "", zip: "" }

/** Best-effort parse of an existing single-line address (from before the
 * structured fields existed) into street/city/state/zip, so editing an old
 * record pre-fills sensibly instead of starting blank. */
export function parseAddress(address: string | undefined | null): AddressParts {
  if (!address) return { ...EMPTY_ADDRESS }
  const segments = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const street = segments[0] ?? ""
  const city = segments[1] ?? ""
  const stateZip = segments[2] ?? ""
  const match = stateZip.match(/^([A-Za-z]{2,})\s*(\d{5}(?:-\d{4})?)?$/)
  const state = (match?.[1] ?? stateZip).toUpperCase()
  const zip = match?.[2] ?? ""
  return { street, city, state, zip }
}

/** Combine structured parts into the single-line string still used for
 * storage/display everywhere else in the app (Firestore keeps one
 * "address" field - this keeps every existing read site working
 * unchanged while the input forms collect proper structured parts). */
export function composeAddress(parts: AddressParts): string {
  const stateZip = [parts.state.trim(), parts.zip.trim()].filter(Boolean).join(" ")
  return [parts.street.trim(), parts.city.trim(), stateZip].filter(Boolean).join(", ")
}

export function isAddressComplete(parts: AddressParts): boolean {
  return Boolean(
    parts.street.trim() && parts.city.trim() && parts.state.trim() && parts.zip.trim()
  )
}
