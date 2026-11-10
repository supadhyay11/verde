import { useT, tr } from "@/lib/i18n"
import * as React from "react"
import { httpsCallable } from "firebase/functions"
import { Check, Copy, Dices, Plus, ShieldCheck, Trash2, UserCog, Users, X } from "lucide-react"
import { Link } from "react-router-dom"
import { TopBar } from "@/components/TopBar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { functions } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useJobsStore } from "@/lib/jobs-store"
import type { BusinessRole } from "@/types"

// Same visually-unambiguous alphabet the server falls back to when the
// admin doesn't type their own password (see randomTempPassword in
// functions/team.js) - used here only for the optional "Generate" button.
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
function generatePassword() {
  let out = ""
  for (let i = 0; i < 10; i++) {
    out += PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)]
  }
  return out
}

const ROLE_LABEL: Record<BusinessRole, string> = {
  admin: "Admin",
  technician: "Technician",
}

function CopyableCredential({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-mono text-sm font-semibold">{value}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  )
}

interface TeamPlan {
  plan: "pro" | "premium"
  planName: string
  maxTechnicians: number
  used: number
  trialEndsAt: string | null
}

export function TeamPage() {
  const t = useT()
  const { user } = useAuth()
  const { businessUsers } = useJobsStore()

  const team = businessUsers
    .filter((u) => u.role === "provider")
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  // The plan decides how many people can have a login (Pro 3, Premium 10).
  // The server enforces it when adding; this just shows it and explains.
  const [plan, setPlan] = React.useState<TeamPlan | null>(null)
  React.useEffect(() => {
    httpsCallable<unknown, TeamPlan>(functions, "getTeamPlan")({})
      .then((res) => setPlan(res.data))
      .catch(() => setPlan(null))
    // Refetch when someone is added or removed.
  }, [team.length])
  const atLimit = plan !== null && plan.used >= plan.maxTechnicians

  const [adding, setAdding] = React.useState(false)
  const [name, setName] = React.useState("")
  // Accepts either an email or a phone number, same as the sign-in
  // field on LoginPage - whichever the technician will type to log in.
  const [identifier, setIdentifier] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [newRole, setNewRole] = React.useState<BusinessRole>("technician")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [created, setCreated] = React.useState<{
    name: string
    signInWith: string
    password: string
  } | null>(null)

  const [busyUid, setBusyUid] = React.useState<string | null>(null)
  const [rowError, setRowError] = React.useState<string | null>(null)
  const [confirmRemoveUid, setConfirmRemoveUid] = React.useState<string | null>(null)

  function resetAddForm() {
    setName("")
    setIdentifier("")
    setPassword("")
    setNewRole("technician")
    setError(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const trimmedIdentifier = identifier.trim()
    if (!name.trim() || !trimmedIdentifier) return
    if (password && password.length < 6) {
      setError(t("Password should be at least 6 characters."))
      return
    }
    const isEmail = trimmedIdentifier.includes("@")
    setSubmitting(true)
    setError(null)
    try {
      const call = httpsCallable(functions, "createTechnician")
      const res = await call({
        name: name.trim(),
        email: isEmail ? trimmedIdentifier : undefined,
        phone: isEmail ? undefined : trimmedIdentifier,
        password: password || undefined,
        businessRole: newRole,
      })
      const data = res.data as { password: string; signInWith: string }
      setCreated({ name: name.trim(), signInWith: data.signInWith, password: data.password })
      setAdding(false)
      resetAddForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Couldn't add that teammate."))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleChangeRole(uid: string, role: BusinessRole) {
    setBusyUid(uid)
    setRowError(null)
    try {
      await httpsCallable(functions, "updateTeamMemberRole")({ uid, businessRole: role })
    } catch (err) {
      setRowError(err instanceof Error ? err.message : t("Couldn't update that role."))
    } finally {
      setBusyUid(null)
    }
  }

  async function handleRemove(uid: string) {
    setBusyUid(uid)
    setRowError(null)
    try {
      await httpsCallable(functions, "removeTeamMember")({ uid })
      setConfirmRemoveUid(null)
    } catch (err) {
      setRowError(err instanceof Error ? err.message : t("Couldn't remove that teammate."))
    } finally {
      setBusyUid(null)
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-4 bg-background pb-8">
      <TopBar title={t("Team")} showBack backTo="/profile" />

      <div className="flex flex-col gap-4 px-4">
        <p className="text-sm text-muted-foreground">
          {t("Add technicians to your team so they can log in and complete the jobs you schedule for them. Admins can manage customers, billing, and the team; technicians only see and complete their assigned jobs.")}
        </p>

        {plan && (
          <Card className="gap-1 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {plan.used} {t("of")} {plan.maxTechnicians} {t("technicians")}
              </p>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {plan.planName} {t("plan")}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${atLimit ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${Math.min(100, (plan.used / plan.maxTechnicians) * 100)}%` }}
              />
            </div>
            {atLimit && (
              <p className="pt-1 text-xs text-muted-foreground">
                {plan.plan === "pro"
                  ? t("You're at the limit for Pro. Premium covers up to 10 technicians.")
                  : t("You're at the limit for Premium.")}{" "}
                <Link to="/support" className="font-medium text-primary underline-offset-2 hover:underline">
                  {t("Contact us to")} {plan.plan === "pro" ? "upgrade" : "add more"}
                </Link>
                .
              </p>
            )}
          </Card>
        )}

        {created && (
          <Card className="gap-3 border-success/30 bg-success/5 p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                <ShieldCheck className="size-4" /> {created.name}{t("'s account is ready")}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Share these sign-in details with")} {created.name} {t("- they should change the password from Profile once they've signed in.")}
              {created.signInWith.includes("@")
                ? ""
                : " " + t("They'll sign in with this phone number - email-based password reset won't work for this account, so if they forget it, come back here and remove/re-add them with a new password instead.")}
            </p>
            <CopyableCredential
              label={created.signInWith.includes("@") ? t("Email") : t("Phone Number")}
              value={created.signInWith}
            />
            <CopyableCredential label={t("Password")} value={created.password} />
          </Card>
        )}

        {rowError && <p className="text-sm text-destructive">{rowError}</p>}

        <div className="flex flex-col gap-2.5">
          {team.map((member) => {
            const role: BusinessRole = member.businessRole ?? "admin"
            const isSelf = member.id === user?.id
            return (
              <Card key={member.id} className="gap-2 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {member.name} {isSelf && <span className="text-muted-foreground">{t("(you)")}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.phone || member.email}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                      role === "admin"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tr(ROLE_LABEL[role])}
                  </span>
                </div>

                {!isSelf && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={role}
                      onChange={(e) => handleChangeRole(member.id, e.target.value as BusinessRole)}
                      disabled={busyUid === member.id}
                      className="h-9 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-xs"
                    >
                      <option value="admin">{t("Admin")}</option>
                      <option value="technician">{t("Technician")}</option>
                    </select>
                    {confirmRemoveUid === member.id ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={busyUid === member.id}
                          onClick={() => handleRemove(member.id)}
                        >
                          {t("Confirm")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmRemoveUid(null)}
                        >
                          {t("Cancel")}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmRemoveUid(member.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>

        {adding ? (
          <Card className="gap-3 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Users className="size-4" /> {t("Add a Teammate")}
            </p>
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="techName">{t("Name")}</Label>
                <Input id="techName" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="techIdentifier">{t("Email or Phone Number")}</Label>
                <Input
                  id="techIdentifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={t("name@example.com or (555) 123-4567")}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t("Whatever they'll type to log in - an email or a phone number, either works.")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="techPassword">{t("Password")}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs font-medium text-primary"
                    onClick={() => setPassword(generatePassword())}
                  >
                    <Dices className="size-3.5" /> {t("Generate one")}
                  </Button>
                </div>
                <Input
                  id="techPassword"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("At least 6 characters")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("Set this yourself, or leave it blank and we'll generate one you can copy after adding them.")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="techRole">{t("Role")}</Label>
                <select
                  id="techRole"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as BusinessRole)}
                  className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm"
                >
                  <option value="technician">{t("Technician - completes assigned jobs")}</option>
                  <option value="admin">{t("Admin - full access, same as you")}</option>
                </select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={submitting}
                  onClick={() => {
                    setAdding(false)
                    resetAddForm()
                  }}
                >
                  {t("Cancel")}
                </Button>
                <Button type="submit" className="flex-1" disabled={submitting}>
                  {submitting ? t("Adding...") : t("Add Teammate")}
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            disabled={atLimit}
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" /> {t("Add a Technician")}
          </Button>
        )}

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserCog className="size-3.5" /> {t("Every business needs at least one admin, so you can't demote or remove the last one.")}
        </p>
      </div>
    </div>
  )
}
