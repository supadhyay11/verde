import { useT, tr } from "@/lib/i18n"
import * as React from "react"
import { Loader2, MapPinOff } from "lucide-react"
import { loadGoogleMaps } from "@/lib/google-maps"
import type { LatLng } from "@/lib/route"

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RouteStop extends LatLng {
  id: string
  num: number
  completed: boolean
}

interface RouteMapProps {
  stops: RouteStop[]
  selectedId: string | null
  /** Faint dashed line behind the route, e.g. today's order while previewing a new one. */
  ghostPath?: LatLng[]
  /** Where the day starts (the business address): drawn as a "B" pin with a line to stop 1. */
  origin?: LatLng
  onSelect: (id: string) => void
  className?: string
}

const NAVY = "#14532D"
const GREEN = "#15803D"
const TEAL = "#2F8F4E"

/** The day's stops as numbered pins joined by a line, in visit order. */
export function RouteMap({ stops, selectedId, ghostPath, origin, onSelect, className }: RouteMapProps) {
  const t = useT()
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<any>(null)
  const overlaysRef = React.useRef<any[]>([])
  const googleRef = React.useRef<any>(null)
  const [state, setState] = React.useState<"loading" | "ready" | "no-key" | "failed">("loading")
  const onSelectRef = React.useRef(onSelect)
  const fitKeyRef = React.useRef<string | null>(null)
  onSelectRef.current = onSelect

  // Load the API and create the map once.
  React.useEffect(() => {
    let cancelled = false
    loadGoogleMaps().then((r) => {
      if (cancelled) return
      if (!r.ok) {
        setState(r.reason === "no-key" ? "no-key" : "failed")
        return
      }
      googleRef.current = r.google
      if (hostRef.current && !mapRef.current) {
        mapRef.current = new r.google.maps.Map(hostRef.current, {
          center: { lat: 37.9, lng: -122.0 },
          zoom: 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        })
      }
      setState("ready")
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Redraw pins + line whenever the stops (or the selection) change.
  React.useEffect(() => {
    const google = googleRef.current
    const map = mapRef.current
    if (state !== "ready" || !google || !map) return
    for (const o of overlaysRef.current) o.setMap(null)
    overlaysRef.current = []
    if (stops.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    if (ghostPath && ghostPath.length > 1) {
      overlaysRef.current.push(
        new google.maps.Polyline({
          map,
          path: ghostPath,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7, strokeColor: "#64748B", scale: 3 },
              offset: "0",
              repeat: "14px",
            },
          ],
        })
      )
    }
    const path = [...(origin ? [origin] : []), ...stops].map((s) => ({ lat: s.lat, lng: s.lng }))
    if (path.length > 1) {
      overlaysRef.current.push(
        new google.maps.Polyline({
          map,
          path,
          strokeColor: TEAL,
          strokeOpacity: 0.9,
          strokeWeight: 4,
        })
      )
    }
    if (origin) {
      bounds.extend({ lat: origin.lat, lng: origin.lng })
      overlaysRef.current.push(
        new google.maps.Marker({
          map,
          position: { lat: origin.lat, lng: origin.lng },
          label: { text: "B", color: "#FFFFFF", fontWeight: "700", fontSize: "12px" },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: "#475569",
            fillOpacity: 1,
            strokeColor: "#FFFFFF",
            strokeWeight: 3,
          },
          title: t("Business address (start)"),
          zIndex: 0,
        })
      )
    }
    for (const s of stops) {
      bounds.extend({ lat: s.lat, lng: s.lng })
      const selected = s.id === selectedId
      const marker = new google.maps.Marker({
        map,
        position: { lat: s.lat, lng: s.lng },
        label: { text: String(s.num), color: "#FFFFFF", fontWeight: "700", fontSize: "13px" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: selected ? 17 : 14,
          fillColor: s.completed ? GREEN : NAVY,
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 3,
        },
        zIndex: selected ? 10 : 1,
        title: tr("Stop {n}", { n: s.num }),
      })
      marker.addListener("click", () => onSelectRef.current(s.id))
      overlaysRef.current.push(marker)
    }
    // Only re-fit the view when the set of stops changes, not on every selection.
    if (!fitKeyRef.current || fitKeyRef.current !== fitKey(stops)) {
      fitKeyRef.current = fitKey(stops)
      if (stops.length === 1) {
        map.setCenter({ lat: stops[0].lat, lng: stops[0].lng })
        map.setZoom(14)
      } else {
        map.fitBounds(bounds, 56)
      }
    }
  }, [stops, selectedId, ghostPath, origin, state])

  // Bring the chosen stop into view.
  React.useEffect(() => {
    const map = mapRef.current
    if (state !== "ready" || !map || !selectedId) return
    const s = stops.find((x) => x.id === selectedId)
    if (s) map.panTo({ lat: s.lat, lng: s.lng })
  }, [selectedId, state, stops])

  return (
    <div className={"relative overflow-hidden rounded-xl border bg-muted " + (className ?? "")}>
      <div ref={hostRef} className="absolute inset-0" />
      {state !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/90 p-6 text-center">
          {state === "loading" ? (
            <>
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("Loading map…")}</p>
            </>
          ) : (
            <>
              <MapPinOff className="size-6 text-muted-foreground" />
              <p className="text-sm font-semibold">
                {state === "no-key" ? t("The map isn't switched on yet") : t("The map couldn't load")}
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {state === "no-key"
                  ? t("Your stops are listed below, and each opens in Google Maps.")
                  : t("Check your connection and reopen this screen. Your stops are listed below.")}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function fitKey(stops: RouteStop[]): string {
  return stops.map((s) => `${s.id}:${s.lat.toFixed(4)},${s.lng.toFixed(4)}`).join("|")
}
