import { VerdeMark } from "@/components/VerdeMark"
import * as React from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowRight, ArrowLeft, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AddressFields } from "@/components/AddressFields"
import { useAuth } from "@/lib/auth-context"
import { composeAddress, isAddressComplete, EMPTY_ADDRESS, type AddressParts } from "@/lib/address"

// Self-reported buckets, not exact counts - faster to tap through at
// sign-up and good enough for our own product/segmentation insight. Not
// used to gate or unlock anything.
const CUSTOMER_RANGES = ["Just starting out", "1–10", "11–25", "26–50", "50+"]
const TEAM_RANGES = ["Just me", "2–5", "6–15", "16+"]

function isEmailValid(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email)
}

/** Dots + "Step X of N" label shown above each screen of the provider
 * wizard. Not shown on the role-choice screen or the (single-screen)
 * owner sign-up - only the multi-step provider flow needs orientation. */
function StepProgress({
  step,
  total,
  label,
}: {
  step: number
  total: number
  label: string
}) {
  return (
    <div className="mb-5 flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            className={
              "h-1.5 rounded-full transition-all " +
              (n === step
                ? "w-6 bg-primary"
                : n < step
                  ? "w-1.5 bg-primary/60"
                  : "w-1.5 bg-border")
            }
          />
        ))}
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        Step {step} of {total} · {label}
      </p>
    </div>
  )
}

/** A row of tappable choice chips for a single-select question (customer
 * count / team size). Plain buttons, not a native <select> - faster to
 * scan and tap on a phone, and makes the current pick obviously visible. */
function ChoiceChips({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={
            "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors " +
            (value === opt
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:border-primary/40")
          }
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

type Screen = "role" | "owner-form" | "provider-wizard"

export function SignUpPage() {
  const [searchParams] = useSearchParams()
  const codeFromLink = searchParams.get("code")

  // Arriving via a scanned invite link skips straight to the (simple,
  // single-screen) owner form, same as before this redesign.
  const [screen, setScreen] = React.useState<Screen>(codeFromLink ? "owner-form" : "role")
  const [providerStep, setProviderStep] = React.useState(1)
  const PROVIDER_STEPS = 5

  // Shared account fields (both roles)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [password, setPassword] = React.useState("")

  // Provider (business) fields
  const [businessName, setBusinessName] = React.useState("")
  const [businessAddr, setBusinessAddr] = React.useState<AddressParts>(EMPTY_ADDRESS)
  const [customerCountRange, setCustomerCountRange] = React.useState("")
  const [teamSizeRange, setTeamSizeRange] = React.useState("")
  const [businessPhone, setBusinessPhone] = React.useState("")
  const [website, setWebsite] = React.useState("")
  const [hours, setHours] = React.useState("")

  // Owner (customer) field - pre-filled when they arrived via a scanned
  // invite QR code / link (see CustomersPage), but still editable in case
  // it's wrong or they're signing up a different way.
  const [inviteCode, setInviteCode] = React.useState(codeFromLink ?? "")

  const [submitting, setSubmitting] = React.useState(false)

  const { signUp, error, clearError } = useAuth()
  const navigate = useNavigate()

  const step1Valid = name.trim() !== "" && isEmailValid(email) && password.length >= 6
  const step2Valid = businessName.trim() !== "" && isAddressComplete(businessAddr)

  async function submitProvider() {
    clearError()
    setSubmitting(true)
    try {
      await signUp({
        role: "provider",
        name,
        email,
        password,
        phone: phone || undefined,
        businessName,
        businessAddress: composeAddress(businessAddr),
        customerCountRange: customerCountRange || undefined,
        teamSizeRange: teamSizeRange || undefined,
        businessPhone: businessPhone || undefined,
        website: website || undefined,
        hours: hours || undefined,
      })
      navigate("/jobs", { replace: true })
    } catch {
      // error state already set by signUp
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOwnerSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    setSubmitting(true)
    try {
      await signUp({
        role: "owner",
        name,
        email,
        password,
        phone: phone || undefined,
        inviteCode: inviteCode.trim(),
      })
      navigate("/jobs", { replace: true })
    } catch {
      // error state already set by signUp
    } finally {
      setSubmitting(false)
    }
  }

  const headerCopy: Record<string, { title: string; subtitle: string }> = {
    role: {
      title: "Create Account",
      subtitle: "Set up your Verde account.",
    },
    "owner-form": {
      title: "Create Account",
      subtitle: "Set up your Verde account.",
    },
    "provider-1": { title: "Create Your Account", subtitle: "Let's start with the basics." },
    "provider-2": { title: "Your Business", subtitle: "Where customers will find you." },
    "provider-3": { title: "Business Size", subtitle: "Helps us tailor Verde for you." },
    "provider-4": { title: "Contact Details", subtitle: "Shown on invoices and reports." },
    "provider-5": { title: "Review & Confirm", subtitle: "Make sure everything looks right." },
  }
  const headerKey = screen === "provider-wizard" ? `provider-${providerStep}` : screen
  const header = headerCopy[headerKey]

  return (
    <div className="flex min-h-full flex-col bg-background">
      <div className="bg-brand-gradient relative overflow-hidden px-6 pt-10 pb-8 text-primary-foreground">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 0%, rgba(255,255,255,0.3), transparent 45%)",
          }}
        />
        <div className="relative mx-auto flex w-full max-w-sm flex-col items-center text-center">
          <a href="https://verde-gardener-app.web.app" aria-label="Go to Verde homepage">
            <span className="shadow-elevated mb-3 flex size-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <VerdeMark className="size-7" />
            </span>
          </a>
          <h1 className="font-display text-2xl font-bold tracking-tight">{header.title}</h1>
          <p className="mt-1 text-sm text-primary-foreground/75">{header.subtitle}</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-sm px-6 py-6">
        {screen === "role" && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setScreen("provider-wizard")}
              className="shadow-elevated flex flex-col items-start gap-1 rounded-2xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-primary/50"
            >
              <p className="font-semibold">I'm a Service Provider</p>
              <p className="text-sm text-muted-foreground">
                I run a gardening or landscaping business and want to manage customers, jobs, and billing.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setScreen("owner-form")}
              className="shadow-elevated flex flex-col items-start gap-1 rounded-2xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-primary/50"
            >
              <p className="font-semibold">I'm a Property Owner</p>
              <p className="text-sm text-muted-foreground">
                My garden service provider gave me an invite code to track my service.
              </p>
            </button>
          </div>
        )}

        {screen === "owner-form" && (
          <form onSubmit={handleOwnerSubmit} className="w-full space-y-4">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input
                type="tel"
                placeholder="+1 555 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Invite Code</Label>
              <Input
                placeholder="Ask your garden service provider for this code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Your garden service provider gives you a unique code when they add you as a
                customer.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Creating account..." : "Create Account"} <ArrowRight className="size-4" />
            </Button>

            {!codeFromLink && (
              <button
                type="button"
                onClick={() => setScreen("role")}
                className="flex w-full items-center justify-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
            )}
          </form>
        )}

        {screen === "provider-wizard" && (
          <div className="w-full">
            <StepProgress
              step={providerStep}
              total={PROVIDER_STEPS}
              label={
                ["Account", "Business", "Business Size", "Contact Details", "Review"][
                  providerStep - 1
                ]
              }
            />

            {providerStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone (optional)</Label>
                  <Input
                    type="tel"
                    placeholder="+1 555 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                  <p className="text-xs text-muted-foreground">At least 6 characters.</p>
                </div>
              </div>
            )}

            {providerStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Business Name</Label>
                  <Input
                    placeholder="e.g. Green Thumb Gardens"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Business Address</Label>
                  <AddressFields value={businessAddr} onChange={setBusinessAddr} />
                </div>
              </div>
            )}

            {providerStep === 3 && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>About how many customers do you currently manage?</Label>
                  <ChoiceChips
                    options={CUSTOMER_RANGES}
                    value={customerCountRange}
                    onChange={setCustomerCountRange}
                  />
                </div>
                <div className="space-y-2">
                  <Label>How many people are on your team (including you)?</Label>
                  <ChoiceChips options={TEAM_RANGES} value={teamSizeRange} onChange={setTeamSizeRange} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Just for us to get a sense of your business - doesn't affect your account.
                </p>
              </div>
            )}

            {providerStep === 4 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Business Phone (optional)</Label>
                  <Input
                    type="tel"
                    placeholder="+1 555 987 6543"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Website (optional)</Label>
                  <Input
                    placeholder="www.sunnypoolcare.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Hours (optional)</Label>
                  <Input
                    placeholder="Mon-Fri 8am-5pm"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
              </div>
            )}

            {providerStep === 5 && (
              <div className="space-y-4">
                <div className="shadow-elevated flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4">
                  <ReviewRow label="Name" value={name} />
                  <ReviewRow label="Email" value={email} />
                  {phone && <ReviewRow label="Phone" value={phone} />}
                  <div className="h-px bg-border" />
                  <ReviewRow label="Business" value={businessName} />
                  <ReviewRow label="Address" value={composeAddress(businessAddr)} />
                  {customerCountRange && <ReviewRow label="Customers" value={customerCountRange} />}
                  {teamSizeRange && <ReviewRow label="Team size" value={teamSizeRange} />}
                  {businessPhone && <ReviewRow label="Business phone" value={businessPhone} />}
                  {website && <ReviewRow label="Website" value={website} />}
                  {hours && <ReviewRow label="Hours" value={hours} />}
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => {
                  if (providerStep === 1) setScreen("role")
                  else setProviderStep((s) => s - 1)
                }}
              >
                <ArrowLeft className="size-4" /> Back
              </Button>
              {providerStep < PROVIDER_STEPS ? (
                <Button
                  type="button"
                  size="lg"
                  className="flex-1"
                  disabled={
                    (providerStep === 1 && !step1Valid) || (providerStep === 2 && !step2Valid)
                  }
                  onClick={() => setProviderStep((s) => s + 1)}
                >
                  Continue <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  className="flex-1"
                  disabled={submitting}
                  onClick={submitProvider}
                >
                  {submitting ? "Creating account..." : "Create Account"}{" "}
                  <Check className="size-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign In
          </Link>
        </p>
        <p className="mt-2 text-center text-sm">
          <a href="https://verde-gardener-app.web.app" className="text-muted-foreground hover:underline">
             Back to Verde
          </a>
        </p>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
