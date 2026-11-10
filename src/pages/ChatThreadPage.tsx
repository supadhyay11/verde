import { pickText } from "@/lib/i18n/text"
import { useI18n, useT } from "@/lib/i18n"
import * as React from "react"
import { useParams } from "react-router-dom"
import { ImagePlus, Loader2, Send } from "lucide-react"
import { TopBar } from "@/components/TopBar"
import { Input } from "@/components/ui/input"
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

export function ChatThreadPage() {
  const t = useT()
  const { propertyId } = useParams()
  const { user } = useAuth()
  const { lang } = useI18n()
  const { messages, getProperty, getUser, businessUsers, addMessage, uploadChatPhoto, markThreadRead } =
    useJobsStore()
  const [draft, setDraft] = React.useState("")
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false)
  const [photoError, setPhotoError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const endRef = React.useRef<HTMLDivElement>(null)

  const property = propertyId ? getProperty(propertyId) : undefined
  const isOwner = user?.role === "owner"
  const counterpart = isOwner
    ? businessUsers.find((u) => u.role === "provider")
    : getUser(property?.ownerId)

  const thread = messages
    .filter((m) => m.propertyId === propertyId)
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [thread.length])

  // Mark this conversation read as soon as it's opened (and again if new
  // messages arrive while it's still open) so the unread badge clears.
  React.useEffect(() => {
    if (propertyId && thread.length > 0) markThreadRead(propertyId)
  }, [propertyId, thread.length, markThreadRead])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim() || !user || !propertyId) return
    addMessage({
      id: `m-${Date.now()}`,
      propertyId,
      businessId: user.businessId,
      senderId: user.id,
      text: draft.trim(),
      createdAt: new Date().toISOString(),
    })
    setDraft("")
  }

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !propertyId) return
    setPhotoError(null)
    setUploadingPhoto(true)
    try {
      await uploadChatPhoto(propertyId, file)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Couldn't send that photo.")
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-background">
      <TopBar
        title={counterpart?.name ?? "Conversation"}
        showBack
        backTo="/chat"
      />
      {property && (
        <p className="border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
          {property.customerName} · {property.address}
        </p>
      )}

      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        {thread.map((message) => {
          const isMine = message.senderId === user?.id
          return (
            <div
              key={message.id}
              className={cn("flex items-end gap-2", isMine && "flex-row-reverse")}
            >
              {!isMine && (
                <Avatar className="size-6">
                  <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                    {counterpart?.name[0] ?? "?"}
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm",
                  isMine
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted text-foreground"
                )}
              >
                {message.photoUrl && (
                  <img
                    src={message.photoUrl}
                    alt={t("Attachment")}
                    className="mb-1.5 w-48 rounded-lg object-cover"
                  />
                )}
                {message.text && (
                  <>
                    <p className="whitespace-pre-wrap">{pickText(message.text, message.translations, lang).shown}</p>
                    {pickText(message.text, message.translations, lang).original && (
                      <p className="mt-1 text-[11px] whitespace-pre-wrap italic opacity-60">
                        {message.text}
                      </p>
                    )}
                  </>
                )}
                <p
                  className={cn(
                    "mt-1 text-right text-[10px] opacity-70"
                  )}
                >
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {photoError && (
        <p className="border-t bg-destructive/5 px-4 py-1.5 text-xs text-destructive">
          {photoError}
        </p>
      )}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t bg-card p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoPick}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPhoto}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          {uploadingPhoto ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </button>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("Type a message...")}
          className="rounded-full"
        />
        <button
          type="submit"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          disabled={!draft.trim()}
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  )
}
