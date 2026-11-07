import { Link } from "react-router-dom"
import { TopBar } from "@/components/TopBar"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useJobsStore } from "@/lib/jobs-store"

// createdAt is normally an ISO string, but a handful of legacy/malformed
// docs may carry a Firestore Timestamp (or be missing entirely) - coerce
// anything to a comparable number instead of assuming .localeCompare exists.
function toMillis(value: unknown): number {
  if (!value) return 0
  if (typeof value === "string") {
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? 0 : t
  }
  if (typeof value === "object" && value !== null && "toMillis" in value) {
    try {
      return (value as { toMillis: () => number }).toMillis()
    } catch {
      return 0
    }
  }
  return 0
}

export function ChatListPage() {
  const { user } = useAuth()
  const { properties, messages, businessUsers, getUser } = useJobsStore()

  const isOwner = user?.role === "owner"
  const lastReadAt = user?.lastReadAt ?? {}

  // One conversation per customer (property) - not per job, so the thread
  // stays continuous across every recurring visit.
  const threads = properties
    .map((property) => {
      const propertyMessages = messages
        .filter((m) => m.propertyId === property.id)
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
      const last = propertyMessages[propertyMessages.length - 1]
      const counterpart = isOwner
        ? businessUsers.find((u) => u.role === "provider")
        : getUser(property.ownerId)
      const readSince = lastReadAt[property.id]
      const readMillis = readSince ? toMillis(readSince) : 0
      const unreadCount = propertyMessages.filter(
        (m) => m.senderId !== user?.id && toMillis(m.createdAt) > readMillis
      ).length
      return { property, last, counterpart, unreadCount }
    })
    .filter((t) => t.counterpart)
    .sort((a, b) => toMillis(b.last?.createdAt) - toMillis(a.last?.createdAt))

  return (
    <div className="flex min-h-full flex-col bg-background">
      <TopBar title="Messages" />
      <div className="flex flex-col gap-2 px-4 py-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
        {threads.map(({ property, last, counterpart, unreadCount }) => (
          <Link key={property.id} to={`/chat/${property.id}`}>
            <Card className="flex-row items-center gap-3 p-3">
              <Avatar>
                <AvatarFallback className="bg-primary/10 text-primary">
                  {counterpart!.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className={cn("font-semibold", unreadCount > 0 && "font-bold")}>
                    {counterpart!.name}
                  </p>
                  {last && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(last.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {property.customerName ?? property.address}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "truncate text-sm",
                      unreadCount > 0
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {last
                      ? last.photoUrl && !last.text
                        ? "📷 Photo"
                        : last.text
                      : "No messages yet"}
                  </p>
                  {unreadCount > 0 && (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {threads.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground lg:col-span-2">
            No conversations yet.
          </p>
        )}
      </div>
    </div>
  )
}
