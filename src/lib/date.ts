const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

export function format(date: Date, pattern: "MMM d, yyyy" = "MMM d, yyyy") {
  void pattern
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

/** Any Date as a local "YYYY-MM-DD" string - same "why not toISOString()"
 * reasoning as localTodayIso below, but for an arbitrary timestamp (e.g.
 * completedAt, which is stored as a full local-timezone-sensitive ISO
 * datetime). Grouping something like "jobs completed today" by day has
 * to use this, not the UTC date the raw string would slice out. */
export function localDateIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Today's date as a local "YYYY-MM-DD" string. Deliberately NOT
 * `new Date().toISOString().slice(0, 10)` - toISOString() converts to
 * UTC first, so for any US timezone that rolls the date forward several
 * hours before local midnight (e.g. ~5pm Pacific). Jobs scheduledDate is
 * always a local date string, so "today" has to be computed the same
 * way or same-day jobs start comparing as if they were scheduled
 * yesterday once UTC ticks over. */
export function localTodayIso(): string {
  return localDateIso(new Date())
}

/** Converts a 24-hour "HH:MM" value (what a native <input type="time">
 * gives you) into the "h:mm AM/PM" display format used everywhere else
 * in the app (e.g. "9:00 AM"). Falls back to the input unchanged if it
 * doesn't look like a time. */
export function formatTime12h(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return value
  let hours = Number(match[1])
  const minutes = match[2]
  const period = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${hours}:${minutes} ${period}`
}

/** Inverse of formatTime12h - turns "9:00 AM" back into "09:00" so a
 * native <input type="time"> can be pre-filled with an existing value. */
export function to24Hour(value: string): string {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim())
  if (!match) return "09:00"
  let hours = Number(match[1])
  const minutes = match[2]
  const period = match[3].toUpperCase()
  if (period === "PM" && hours !== 12) hours += 12
  if (period === "AM" && hours === 12) hours = 0
  return `${String(hours).padStart(2, "0")}:${minutes}`
}
