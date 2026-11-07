/**
 * Generates a simple garden-themed placeholder image as a data URI SVG.
 * Used in place of hotlinked photos so the app has zero external image
 * dependencies (nothing to break, no attribution, no cost).
 */
export function poolPlaceholder(
  label: string,
  variant: "before" | "after" | "generic" = "generic"
) {
  const palette =
    variant === "before"
      ? { water: "#7c9cad", accent: "#5b7b8c" }
      : variant === "after"
        ? { water: "#3fa9d6", accent: "#1a6f9c" }
        : { water: "#4fb3d9", accent: "#1f7a9c" }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="w" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${palette.water}" />
        <stop offset="100%" stop-color="${palette.accent}" />
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="${palette.accent}" />
    <rect y="60" width="400" height="340" fill="url(#w)" />
    <path d="M0 60 Q 50 40 100 60 T 200 60 T 300 60 T 400 60 V0 H0 Z" fill="#f0f4f0" />
    <circle cx="200" cy="230" r="70" fill="#ffffff" opacity="0.12" />
    <text x="200" y="360" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" fill="#ffffff" opacity="0.9">${label}</text>
  </svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
