import * as React from "react"
import { Bell, ChevronRight, Clock, Gift, Globe, Image as ImageIcon, KeyRound, LifeBuoy, LogOut, Mail, MapPin, Phone, Trash2, Users, Wallet } from "lucide-react"
import { LanguageToggle, useT } from "@/lib/i18n"
import { TopBar } from "@/components/TopBar"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { isBizAdmin, useAuth } from "@/lib/auth-context"
import { useJobsStore } from "@/lib/jobs-store"
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushSupport,
  type PushPermissionState,
} from "@/lib/push-notifications"
import { Link, useNavigate } from "react-router-dom"

export function ProfilePage() {
  const t = useT()
  const { user, logout, resetPassword, updateUserProfile, deleteMyAccount } = useAuth()
  const { business, updateBusiness, uploadBusinessLogo } = useJobsStore()
  const navigate = useNavigate()
  const [resetState, setResetState] = React.useState<
    "idle" | "sending" | "sent" | "error"
  >("idle")

  const [pushState, setPushState] = React.useState<PushPermissionState | "checking">("checking")
  const [pushBusy, setPushBusy] = React.useState(false)

  React.useEffect(() => {
    getPushSupport().then(setPushState)
  }, [])

  async function handleTogglePush() {
    if (!user) return
    setPushBusy(true)
    try {
      if (pushState === "granted") {
        await disablePushNotifications(user.id)
        setPushState("default")
      } else {
        const result = await enablePushNotifications(user.id)
        setPushState(result)
      }
    } finally {
      setPushBusy(false)
    }
  }

  const [editingAccount, setEditingAccount] = React.useState(false)
  const [accountName, setAccountName] = React.useState("")
  const [accountPhone, setAccountPhone] = React.useState("")
  const [savingAccount, setSavingAccount] = React.useState(false)

  function startEditingAccount() {
    setAccountName(user?.name ?? "")
    setAccountPhone(user?.phone ?? "")
    setEditingAccount(true)
  }

  async function handleSaveAccount() {
    if (!accountName.trim()) return
    setSavingAccount(true)
    try {
      await updateUserProfile({ name: accountName.trim(), phone: accountPhone.trim() })
      setEditingAccount(false)
    } finally {
      setSavingAccount(false)
    }
  }

  const [editingBusiness, setEditingBusiness] = React.useState(false)
  const [businessName, setBusinessName] = React.useState("")
  const [businessAddress, setBusinessAddress] = React.useState("")
  const [businessPhone, setBusinessPhone] = React.useState("")
  const [businessWebsite, setBusinessWebsite] = React.useState("")
  const [businessHours, setBusinessHours] = React.useState("")
  const [savingBusiness, setSavingBusiness] = React.useState(false)

  const logoInputRef = React.useRef<HTMLInputElement>(null)
  const [logoUploading, setLogoUploading] = React.useState(false)
  const [logoError, setLogoError] = React.useState<string | null>(null)

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setLogoError(null)
    setLogoUploading(true)
    try {
      await uploadBusinessLogo(file)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : t("Couldn't upload logo."))
    } finally {
      setLogoUploading(false)
    }
  }

  function startEditingBusiness() {
    setBusinessName(business?.name ?? "")
    setBusinessAddress(business?.address ?? "")
    setBusinessPhone(business?.phone ?? "")
    setBusinessWebsite(business?.website ?? "")
    setBusinessHours(business?.hours ?? "")
    setEditingBusiness(true)
  }

  async function handleSaveBusiness() {
    if (!businessName.trim() || !businessAddress.trim()) return
    setSavingBusiness(true)
    try {
      await updateBusiness({
        name: businessName.trim(),
        address: businessAddress.trim(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        phone: (businessPhone.trim() || null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        website: (businessWebsite.trim() || null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hours: (businessHours.trim() || null) as any,
      })
      setEditingBusiness(false)
    } finally {
      setSavingBusiness(false)
    }
  }

  const [editingPayment, setEditingPayment] = React.useState(false)
  const [venmoUsername, setVenmoUsername] = React.useState("")
  const [zelleContact, setZelleContact] = React.useState("")
  const [savingPayment, setSavingPayment] = React.useState(false)

  function startEditingPayment() {
    setVenmoUsername(business?.venmoUsername ?? "")
    setZelleContact(business?.zelleContact ?? "")
    setEditingPayment(true)
  }

  async function handleSavePayment() {
    setSavingPayment(true)
    try {
      await updateBusiness({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        venmoUsername: (venmoUsername.trim() || null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        zelleContact: (zelleContact.trim() || null) as any,
      })
      setEditingPayment(false)
    } finally {
      setSavingPayment(false)
    }
  }


  const [confirmingDeleteAccount, setConfirmingDeleteAccount] = React.useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("")
  const [deletingAccount, setDeletingAccount] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  if (!user) return null

  async function handleLogout() {
    await logout()
    navigate("/login", { replace: true })
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true)
    setDeleteError(null)
    try {
      await deleteMyAccount()
      navigate("/login", { replace: true })
    } catch {
      setDeleteError(t("Couldn't delete your account. Try again in a moment, or contact support."))
      setDeletingAccount(false)
    }
  }

  async function handleChangePassword() {
    setResetState("sending")
    try {
      await resetPassword(user!.email)
      setResetState("sent")
    } catch {
      setResetState("error")
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-background">
      <TopBar title={t("Profile")} />
      <div className="flex flex-col items-center gap-2 px-4 py-6">
        <Avatar className="size-20">
          <AvatarFallback className="bg-primary/10 text-2xl text-primary">
            {user.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </AvatarFallback>
        </Avatar>
        <h2 className="text-lg font-bold">{user.name}</h2>
        <p className="text-sm capitalize text-muted-foreground">
          {user.role === "provider"
            ? isBizAdmin(user)
              ? t("Service Provider · Admin")
              : t("Technician")
            : t("Property Owner")}
        </p>
      </div>

      <div className="flex flex-col gap-3 px-4">
        {isBizAdmin(user) && (
          <Button asChild variant="outline" className="w-full justify-between">
            <Link to="/team">
              <span className="flex items-center gap-2">
                <Users className="size-4" /> {t("Team")}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </Button>
        )}
        {isBizAdmin(user) && (
          <Button asChild variant="outline" className="w-full justify-between">
            <Link to="/referrals">
              <span className="flex items-center gap-2">
                <Gift className="size-4" /> {t("Refer a garden pro - you both get 3 months free")}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </Button>
        )}
        <Card className="gap-2 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Globe className="size-4" /> {t("Language / Idioma")}
          </p>
          <LanguageToggle />
        </Card>
        <Card className="gap-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{t("Account")}</p>
            {!editingAccount && (
              <Button variant="ghost" size="sm" onClick={startEditingAccount}>
                {t("Edit")}
              </Button>
            )}
          </div>

          {editingAccount ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accountName">{t("Name")}</Label>
                <Input
                  id="accountName"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accountPhone">{t("Phone")}</Label>
                <Input
                  id="accountPhone"
                  type="tel"
                  placeholder="+1 555 123 4567"
                  value={accountPhone}
                  onChange={(e) => setAccountPhone(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Email can't be changed here - contact support if it needs to update.")}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditingAccount(false)}
                  disabled={savingAccount}
                >
                  {t("Cancel")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSaveAccount}
                  disabled={savingAccount || !accountName.trim()}
                >
                  {savingAccount ? t("Saving...") : t("Save")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="size-4 text-muted-foreground" /> {user.email}
              </div>
              {user.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="size-4 text-muted-foreground" /> {user.phone}
                </div>
              )}
            </>
          )}
        </Card>

        {business && (
          <Card className="gap-2 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {user.role === "provider" ? t("Your Business") : t("Serviced By")}
              </p>
              {isBizAdmin(user) && !editingBusiness && (
                <Button variant="ghost" size="sm" onClick={startEditingBusiness}>
                  {t("Edit")}
                </Button>
              )}
            </div>

            {isBizAdmin(user) && (
              <div className="flex items-center gap-3">
                {business.logoUrl ? (
                  <img
                    src={business.logoUrl}
                    alt={t("Business logo")}
                    className="size-12 rounded-md border object-contain"
                  />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                    <ImageIcon className="size-5" />
                  </span>
                )}
                <div className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                  >
                    {logoUploading ? t("Uploading...") : business.logoUrl ? t("Change logo") : t("Add a logo")}
                  </Button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                  {logoError && <p className="text-xs text-destructive">{logoError}</p>}
                </div>
              </div>
            )}

            {editingBusiness ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="businessName">{t("Business name")}</Label>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="businessAddress">{t("Address")}</Label>
                  <Input
                    id="businessAddress"
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="businessPhone">{t("Phone")}</Label>
                  <Input
                    id="businessPhone"
                    type="tel"
                    placeholder="+1 555 123 4567"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="businessWebsite">{t("Website (optional)")}</Label>
                  <Input
                    id="businessWebsite"
                    placeholder={t("verde-gardener-app.web.app")}
                    value={businessWebsite}
                    onChange={(e) => setBusinessWebsite(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="businessHours">{t("Hours (optional)")}</Label>
                  <Input
                    id="businessHours"
                    placeholder={t("Mon-Fri, 8am-5pm")}
                    value={businessHours}
                    onChange={(e) => setBusinessHours(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setEditingBusiness(false)}
                    disabled={savingBusiness}
                  >
                    {t("Cancel")}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSaveBusiness}
                    disabled={savingBusiness || !businessName.trim() || !businessAddress.trim()}
                  >
                    {savingBusiness ? t("Saving...") : t("Save")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="font-bold text-primary">{business.name}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="size-3.5" /> {business.address}
                </div>
                {business.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="size-3.5" /> {business.phone}
                  </div>
                )}
                {business.website && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Globe className="size-3.5" /> {business.website}
                  </div>
                )}
                {business.hours && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="size-3.5" /> {business.hours}
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {business && isBizAdmin(user) && (
          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Wallet className="size-4" /> {t("Payment Settings")}
              </p>
              {!editingPayment && (
                <Button variant="ghost" size="sm" onClick={startEditingPayment}>
                  {t("Edit")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Shown on invoices you send, so customers can pay you directly. Payment is always completed by the customer manually - there's no processor involved, so you'll mark invoices as paid yourself once they come through.")}
            </p>

            {editingPayment ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="venmoUsername">{t("Venmo username")}</Label>
                  <Input
                    id="venmoUsername"
                    placeholder={t("your-venmo-handle")}
                    value={venmoUsername}
                    onChange={(e) => setVenmoUsername(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="zelleContact">{t("Zelle email or phone")}</Label>
                  <Input
                    id="zelleContact"
                    placeholder={t("you@example.com")}
                    value={zelleContact}
                    onChange={(e) => setZelleContact(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setEditingPayment(false)}
                    disabled={savingPayment}
                  >
                    {t("Cancel")}
                  </Button>
                  <Button className="flex-1" onClick={handleSavePayment} disabled={savingPayment}>
                    {savingPayment ? t("Saving...") : t("Save")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <p>{t("Venmo:")} {business.venmoUsername || t("Not set")}</p>
                <p>{t("Zelle:")} {business.zelleContact || t("Not set")}</p>
              </div>
            )}
          </Card>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={handleChangePassword}
          disabled={resetState === "sending"}
        >
          <KeyRound className="size-4" />
          {resetState === "sending" ? t("Sending...") : t("Change Password")}
        </Button>
        {resetState === "sent" && (
          <p className="text-center text-xs text-success">
            {t("Check your email (")}{user.email}{t(") for a link to set a new password.")}
          </p>
        )}
        {resetState === "error" && (
          <p className="text-center text-xs text-destructive">
            {t("Couldn't send the reset email. Try again in a moment.")}
          </p>
        )}

        {pushState !== "unsupported" && (
          <Card className="gap-2 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Bell className="size-4" /> {t("Push Notifications")}
            </p>
            <p className="text-xs text-muted-foreground">
              {user.role === "provider"
                ? t("Get notified about new customer messages the moment they come in.")
                : t("Get notified when your provider messages you, schedules a new visit, or finishes a job.")}
            </p>
            {pushState === "denied" ? (
              <p className="text-xs text-muted-foreground">
                {t("Notifications are blocked for Verde in your browser/phone settings - turn them back on there to enable this.")}
              </p>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleTogglePush}
                disabled={pushBusy || pushState === "checking"}
              >
                {pushBusy
                  ? t("Working...")
                  : pushState === "granted"
                    ? t("Turn off notifications on this device")
                    : t("Turn on notifications")}
              </Button>
            )}
          </Card>
        )}

        <Button asChild variant="outline" className="w-full">
          <Link to="/support">
            <LifeBuoy className="size-4" /> {t("Help & Support")}
          </Link>
        </Button>

        <Button variant="outline" className="w-full" onClick={handleLogout}>
          <LogOut className="size-4" /> {t("Sign Out")}
        </Button>

        <Card className="gap-3 border-destructive/30 bg-destructive/5 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <Trash2 className="size-4" /> {t("Delete Account")}
          </p>
          {!confirmingDeleteAccount ? (
            <>
              <p className="text-xs text-muted-foreground">
                {user.role === "provider"
                  ? isBizAdmin(user)
                    ? t("Permanently deletes your login. If you're the only admin on this business, this also deletes the whole business - every customer, job, and message tied to it. This can't be undone.")
                    : t("Permanently deletes your login. Your business's customers, jobs, and other team accounts are not affected.")
                  : t("Permanently deletes your login and disconnects you from your provider. Your service history stays with your provider's records.")}
              </p>
              <Button
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:text-destructive"
                onClick={() => setConfirmingDeleteAccount(true)}
              >
                {t("Delete my account")}
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-destructive">
                {user.role === "provider" && isBizAdmin(user)
                  ? t("If you're the only admin, this deletes your account and every customer, job, and message in your business. Type DELETE to confirm.")
                  : t("This permanently deletes your account. Type DELETE to confirm.")}
              </p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={t("DELETE")}
                disabled={deletingAccount}
              />
              {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={deletingAccount}
                  onClick={() => {
                    setConfirmingDeleteAccount(false)
                    setDeleteConfirmText("")
                    setDeleteError(null)
                  }}
                >
                  {t("Cancel")}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={deletingAccount || deleteConfirmText.trim() !== "DELETE"}
                  onClick={handleDeleteAccount}
                >
                  {deletingAccount ? t("Deleting...") : t("Permanently Delete")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
