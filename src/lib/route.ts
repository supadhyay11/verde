import { to24Hour } from "@/lib/date"

// Small, dependency-free route helpers for the day map. Everything here is
// plain math on lat/lng pairs - no Google calls - so it costs nothing to run
// as often as the screen re-renders, and the same functions can power route
// optimization later.

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_MILES = 3958.8

/** Straight-line ("as the crow flies") distance between two points, in miles. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Roads are longer than straight lines. 1.3 is a typical suburban ratio, so
 * distances on screen are shown as approximate ("~") rather than exact. */
export const ROAD_FACTOR = 1.3

export function approxDriveMiles(a: LatLng, b: LatLng): number {
  return haversineMiles(a, b) * ROAD_FACTOR
}

/** Approximate driving miles through the points in the given order. */
export function approxRouteMiles(points: LatLng[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += approxDriveMiles(points[i - 1], points[i])
  return total
}

export function formatMiles(miles: number): string {
  return miles < 10 ? miles.toFixed(1) : String(Math.round(miles))
}

export interface DirectionsStop extends Partial<LatLng> {
  address: string
}

/** A Google Maps "directions" universal link through the stops in order.
 * Opens the Google Maps app on a phone, or maps.google.com on a computer.
 * Google allows an origin, a destination and up to 9 waypoints in between, so
 * a longer day is split: the first 11 stops go in this link. */
export function googleDirectionsUrl(stops: DirectionsStop[]): string | null {
  if (stops.length === 0) return null
  const place = (s: DirectionsStop) =>
    typeof s.lat === "number" && typeof s.lng === "number" ? `${s.lat},${s.lng}` : s.address
  const used = stops.slice(0, 11)
  const params = new URLSearchParams({ api: "1", travelmode: "driving" })
  params.set("destination", place(used[used.length - 1]))
  if (used.length > 1) {
    params.set("origin", place(used[0]))
    if (used.length > 2) params.set("waypoints", used.slice(1, -1).map(place).join("|"))
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** Shortest-path order through the points (an "open" route: it doesn't have to
 * return to the start). Nearest-neighbour from every possible start, then 2-opt
 * clean-up, keeping the best. Plenty fast for a day's stops (tens of them) and
 * runs entirely on the device - no Google calls, no cost.
 *
 * `fixedStart`: the first point is where the driver already is (e.g. the last
 * finished stop) and must stay first. Returns indices into `points`. */
export function optimizeOrder(points: LatLng[], fixedStart = false): number[] {
  const n = points.length
  if (n <= 2) return points.map((_, i) => i)
  const d: number[][] = points.map((a) => points.map((b) => haversineMiles(a, b)))
  const cost = (path: number[]) => {
    let c = 0
    for (let i = 1; i < path.length; i++) c += d[path[i - 1]][path[i]]
    return c
  }
  const starts = fixedStart ? [0] : points.map((_, i) => i)
  let best: number[] = []
  let bestCost = Infinity
  for (const s of starts) {
    const left = new Set(points.map((_, i) => i))
    left.delete(s)
    const path = [s]
    while (left.size) {
      const last = path[path.length - 1]
      let next = -1
      let nd = Infinity
      for (const j of left) {
        if (d[last][j] < nd) {
          nd = d[last][j]
          next = j
        }
      }
      path.push(next)
      left.delete(next)
    }
    // 2-opt: reverse a stretch whenever that shortens the route.
    let improved = true
    while (improved) {
      improved = false
      for (let i = fixedStart ? 1 : 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          const before = (i > 0 ? d[path[i - 1]][path[i]] : 0) + (j < n - 1 ? d[path[j]][path[j + 1]] : 0)
          const after = (i > 0 ? d[path[i - 1]][path[j]] : 0) + (j < n - 1 ? d[path[i]][path[j + 1]] : 0)
          if (after < before - 1e-9) {
            const seg = path.slice(i, j + 1).reverse()
            path.splice(i, seg.length, ...seg)
            improved = true
          }
        }
      }
    }
    const c = cost(path)
    if (c < bestCost) {
      bestCost = c
      best = path.slice()
    }
  }
  return best
}

interface RouteSortable {
  routeOrder?: number | null
  scheduledTime: string
}

/** Visit order within one day: stops the provider has optimized come first, in
 * their saved route order; everything else follows in scheduled-time order. */
export function compareByRoute(a: RouteSortable, b: RouteSortable): number {
  const ra = typeof a.routeOrder === "number" ? a.routeOrder : null
  const rb = typeof b.routeOrder === "number" ? b.routeOrder : null
  if (ra !== null && rb !== null) return ra - rb
  if (ra !== null) return -1
  if (rb !== null) return 1
  return to24Hour(a.scheduledTime).localeCompare(to24Hour(b.scheduledTime))
}
