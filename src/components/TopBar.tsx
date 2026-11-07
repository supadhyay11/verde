import { Bell, ChevronLeft, Droplet } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useNavigate } from "react-router-dom"

export function TopBar({
  title = "Verde",
  showLogo = true,
  showBack = false,
  backTo = "/jobs",
  initials,
}: {
  title?: string
  showLogo?: boolean
  showBack?: boolean
  /** Where to go if there's no in-app history to go back to - see
   * handleBack below. Defaults to the Jobs tab, which every signed-in
   * user has. */
  backTo?: string
  initials?: string
}) {
  const navigate = useNavigate()

  function handleBack() {
    // Installed as a home-screen app (standalone display mode), there's
    // no Safari back button or edge-swipe gesture at all - this button
    // is the ONLY way back, and it has to work every time. navigate(-1)
    // alone isn't reliable here: iOS can reload the app's whole webview
    // in the background, or someone can open it fresh from the home
    // screen icon straight onto a detail route (no intermediate list
    // screen in this session's history yet) - either way there's
    // nothing for "-1" to go back to, and it silently does nothing,
    // which looks exactly like "this screen has no working back button".
    // React Router's history keeps a running `idx` in window.history.state;
    // idx of 0 (or missing) means this is the first entry in the current
    // session, so there's nowhere to actually go back to - fall back to
    // a known parent screen instead of a dead button.
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === "number" && idx > 0) {
      navigate(-1)
    } else {
      navigate(backTo)
    }
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/70 bg-card/90 px-4 py-3.5 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        {showBack && (
          <button
            onClick={handleBack}
            className="-ml-1 flex size-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-accent"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        {showLogo && !showBack && (
          <span className="bg-brand-gradient shadow-elevated flex size-7 items-center justify-center rounded-full text-white">
            <Droplet className="size-4" fill="currentColor" />
          </span>
        )}
        <h1 className="font-display text-base font-bold tracking-tight text-foreground">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        {initials ? (
          <Avatar className="ring-primary/10 size-8 ring-2">
            <AvatarFallback className="bg-brand-gradient text-xs font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        ) : (
          <button className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Bell className="size-5" />
          </button>
        )}
      </div>
    </header>
  )
}
