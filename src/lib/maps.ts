/** A Google Maps "search" universal link - opens the Google Maps app
 * directly if it's installed (iOS or Android), otherwise falls back to
 * maps.google.com in the browser. Deliberately not a `geo:`/`maps:` URI
 * scheme link, since those are platform-specific (Android/iOS only,
 * respectively, and unpredictable on desktop) - this one link works
 * everywhere a provider might tap it from. */
export function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
