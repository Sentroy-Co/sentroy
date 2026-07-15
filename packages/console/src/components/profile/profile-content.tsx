"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import { Sentroy } from "@sentroy-co/client-sdk"
import { MediaManagerTrigger } from "@sentroy-co/client-sdk/react"
import { useTranslations } from "next-intl"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { useSession, authClient } from "@workspace/auth/client/auth-client"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Delete02Icon,
  Shield01Icon,
  Tick02Icon,
  Cancel01Icon,
  LockPasswordIcon,
  Key01Icon,
} from "@hugeicons/core-free-icons"
import { SocialProviderIcon } from "@workspace/auth/components/social-provider-icon"
import { SOCIAL_PROVIDERS } from "@workspace/auth/lib/social-providers"

import {
  PageTransition,
  DirectAvatarUpload,
} from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { confirm } from "@workspace/console/stores/confirm"
import { resolveMediaPickUrl } from "@workspace/console/lib/media-pick-url"
import {
  TwoFactorSetupDialog,
  TwoFactorDisableDialog,
} from "@workspace/console/components/profile/two-factor-dialog"
import { PasskeySection } from "@workspace/auth/components/passkey-section"
import { SetPasswordDialog } from "@workspace/console/components/profile/set-password-dialog"

// ── Types ───────────────────────────────────────────────────────────────────

interface SessionData {
  id: string
  userId: string
  token: string
  expiresAt: string
  ipAddress: string | null
  userAgent: string | null
  ipInfo: {
    city?: string
    region?: string
    country?: string
    country_code?: string
    as_name?: string
    [key: string]: unknown
  } | null
  createdAt: string
  updatedAt: string
  isCurrent?: boolean
}

interface LinkedAccount {
  id: string
  providerId: string
  accountId: string
  createdAt?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown"
  if (ua.includes("Edg/")) return "Edge"
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera"
  if (ua.includes("Chrome")) return "Chrome"
  if (ua.includes("Firefox")) return "Firefox"
  if (ua.includes("Safari")) return "Safari"
  return ua.substring(0, 30)
}

function getLocationString(ipInfo: SessionData["ipInfo"]): string {
  if (!ipInfo) return "-"
  const primary = [ipInfo.city, ipInfo.region, ipInfo.country].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  )
  return primary.length > 0 ? primary.join(", ") : "-"
}

function getNetworkInfo(ipInfo: SessionData["ipInfo"]): string | null {
  if (!ipInfo) return null
  const asName = ipInfo.as_name
  return typeof asName === "string" && asName.length > 0 ? asName : null
}

function formatRelative(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export function ProfileContent() {
  const t = useTranslations("profile")
  const tCommon = useTranslations("common")

  // ── Hesap silme (danger zone) — kod-doğrulamalı kalıcı silme akışı ──
  const [deleteState, setDeleteState] = useState<{
    phase: "idle" | "code"
    busy: boolean
    code: string
    ownedCompanies: Array<{ slug: string; name: string }>
  }>({ phase: "idle", busy: false, code: "", ownedCompanies: [] })

  const requestAccountDeletion = useCallback(async () => {
    const ok = await confirm({
      title: t("deleteAccount"),
      description: t("deleteAccountDescription"),
      confirmText: t("deleteAccount"),
      destructive: true,
    })
    if (!ok) return
    setDeleteState((s) => ({ ...s, busy: true }))
    try {
      const res = await fetch("/api/user/delete-account/request", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setDeleteState({
        phase: "code",
        busy: false,
        code: "",
        ownedCompanies: (json.data?.ownedCompanies ?? []) as Array<{ slug: string; name: string }>,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
      setDeleteState((s) => ({ ...s, busy: false }))
    }
  }, [t])

  const confirmAccountDeletion = useCallback(async () => {
    setDeleteState((s) => ({ ...s, busy: true }))
    try {
      const res = await fetch("/api/user/delete-account/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: deleteState.code }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("deleteAccountDone"))
      // Hesap gitti — oturum kalıntısını bırakmadan köke dön.
      window.location.href = "/"
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
      setDeleteState((s) => ({ ...s, busy: false }))
    }
  }, [deleteState.code, t])
  const { data: session } = useSession()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [image, setImage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Public profile state
  const [profileSlug, setProfileSlug] = useState("")
  const [bio, setBio] = useState("")
  const [headline, setHeadline] = useState("")
  const [location, setLocation] = useState("")
  const [website, setWebsite] = useState("")
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [isPublicProfile, setIsPublicProfile] = useState(false)
  const [publicSaving, setPublicSaving] = useState(false)
  const [socialLinks, setSocialLinks] = useState<
    Array<{ type: string; url: string }>
  >([])

  // Sentroy client — site içinde olduğumuz için accessToken yok, cookie
  // auth ile çalışır (HttpClient credentials: include).
  //
  // companySlug çözümü:
  //   1. URL'de [company-slug] varsa onu kullan (eski /d/{slug}/profile
  //      route'unda) — backwards-compat.
  //   2. Yoksa user'ın ilk company'sini fetch et (yeni /profile route'u).
  //      Hiç company yoksa null — MediaManager dialog "no company" mesajı
  //      gösterir, kullanıcı yine de profil bilgilerini düzenleyebilir.
  const params = useParams<{ "company-slug"?: string }>()
  const urlCompanySlug = params["company-slug"] ?? ""
  const [fallbackCompanySlug, setFallbackCompanySlug] = useState<string | null>(
    null,
  )
  useEffect(() => {
    if (urlCompanySlug) return
    let cancelled = false
    fetch("/api/companies")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        const first = (j.data as Array<{ slug: string }> | undefined)?.[0]
        if (first?.slug) setFallbackCompanySlug(first.slug)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [urlCompanySlug])
  const companySlug = urlCompanySlug || fallbackCompanySlug || ""
  const sentroyClient = useMemo(() => {
    if (!companySlug) return null
    const baseUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "")
    // Cookie auth (no accessToken) — SDK source'ta optional ama npm'deki
    // v2.2.1 type'ında hala required. v2.2.2 publish sonrası cast kaldırılır.
    return new Sentroy({
      baseUrl,
      companySlug,
    } as unknown as ConstructorParameters<typeof Sentroy>[0])
  }, [companySlug])

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)

  // Sessions
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  // Linked accounts
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null)
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(
    null,
  )

  // 2FA
  const [setupOpen, setSetupOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  // Set password (OAuth-only kullanicilar icin)
  const [setPasswordOpen, setSetPasswordOpen] = useState(false)

  const twoFactorEnabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)
      ?.twoFactorEnabled,
  )

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name ?? "")
      setEmail(session.user.email ?? "")
      setImage((session.user as { image?: string | null }).image ?? null)
    }
  }, [session])

  // ── Fetch: sessions & accounts ────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await fetch("/api/user/sessions")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setSessions((json.data as SessionData[]) ?? [])
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load sessions",
      )
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const res = await fetch("/api/user/accounts")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setAccounts((json.data as LinkedAccount[]) ?? [])
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load accounts",
      )
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    fetchAccounts()
  }, [fetchSessions, fetchAccounts])

  // Profile (public + private) — sayfa açılışında fetch ve form'u doldur.
  useEffect(() => {
    let cancelled = false
    fetch("/api/user/profile", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.data) return
        const u = j.data as {
          profileSlug?: string | null
          bio?: string | null
          headline?: string | null
          location?: string | null
          website?: string | null
          coverImage?: string | null
          isPublicProfile?: boolean
          image?: string | null
          socialLinks?: Array<{ type: string; url: string }>
        }
        setProfileSlug(u.profileSlug ?? "")
        setBio(u.bio ?? "")
        setHeadline(u.headline ?? "")
        setLocation(u.location ?? "")
        setWebsite(u.website ?? "")
        setCoverImage(u.coverImage ?? null)
        setIsPublicProfile(!!u.isPublicProfile)
        setSocialLinks(u.socialLinks ?? [])
        if (u.image !== undefined) setImage(u.image ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSavePublicProfile() {
    setPublicSaving(true)
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          profileSlug: profileSlug.trim() || null,
          bio: bio.trim() || null,
          headline: headline.trim() || null,
          location: location.trim() || null,
          website: website.trim() || null,
          coverImage,
          isPublicProfile,
          // Boş URL'leri filtrele — server zaten skip ediyor ama temiz
          // payload göndermek bandwidth + DB tarafında daha iyi.
          socialLinks: socialLinks.filter((s) => s.url.trim().length > 0),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("publicSaved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setPublicSaving(false)
    }
  }

  // ── Handlers: profile ─────────────────────────────────────────────────────

  // DirectAvatarUpload kendi multipart POST'unu /api/user/profile/avatar'a
  // yapıyor; backend `{data: {image: url}}` döndürür. Biz sadece UI state'i
  // güncellüyoruz — DB tarafı endpoint'in içinde halledildi.
  function handleAvatarUploaded(response: unknown) {
    const data =
      (response as { data?: { image?: string | null } } | null)?.data ?? {}
    const next = data.image ?? null
    setImage(next)
    toast.success(t("avatarUpdated"))
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true)
    try {
      const res = await fetch("/api/user/profile/avatar", { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Avatar remove failed")
      setImage(null)
      toast.success(t("avatarRemoved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Avatar remove failed")
    } finally {
      setAvatarUploading(false)
    }
  }

  async function handleSaveProfile() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to update profile")
      toast.success(t("saved"))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      toast.error(t("passwordMinLength"))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("passwordMismatch"))
      return
    }
    setChangingPassword(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("passwordChanged"))
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setChangingPassword(false)
    }
  }

  // ── Handlers: sessions ────────────────────────────────────────────────────

  async function handleRevokeSession(s: SessionData) {
    setRevokingId(s.id)
    try {
      const res = await fetch("/api/user/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: s.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setSessions((prev) => prev.filter((x) => x.id !== s.id))
      toast.success(t("sessionRevoked"))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setRevokingId(null)
    }
  }

  async function handleRevokeAll() {
    const ok = await confirm({
      title: t("confirmRevokeAll"),
      description: t("revokeAllDesc"),
      confirmText: t("revokeAll"),
      destructive: true,
    })
    if (!ok) return
    setRevokingAll(true)
    try {
      const res = await fetch("/api/user/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeAll: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setSessions((prev) => prev.filter((s) => s.isCurrent))
      toast.success(t("allRevoked"))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setRevokingAll(false)
    }
  }

  // ── Handlers: linked accounts ─────────────────────────────────────────────

  async function handleLinkProvider(provider: string) {
    setLinkingProvider(provider)
    try {
      await authClient.linkSocial({
        provider: provider as "google" | "github",
        callbackURL: window.location.href,
      })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to link")
      setLinkingProvider(null)
    }
  }

  async function handleUnlinkProvider(provider: string, accountId: string) {
    const ok = await confirm({
      title: t("confirmUnlink"),
      description: t("confirmUnlinkDesc", { provider }),
      confirmText: t("unlink"),
      destructive: true,
    })
    if (!ok) return

    setUnlinkingProvider(provider)
    try {
      const res = await fetch("/api/user/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider, accountId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("providerUnlinked"))
      fetchAccounts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to unlink")
    } finally {
      setUnlinkingProvider(null)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const hasOtherSessions = sessions.some((s) => !s.isCurrent)
  const hasCredential = accounts.some((a) => a.providerId === "credential")

  // Kullanıcının toplam bağlı giriş yöntemi sayısı — sonuncuyu koparmak
  // kullanıcıyı hesabından kilitler, izin verilmez.
  const totalMethodCount = accounts.length
  const canUnlink = totalMethodCount > 1

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageTransition className="flex flex-1 flex-col gap-4 max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Tabs defaultValue="personal" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="personal">{t("personalInfo")}</TabsTrigger>
          <TabsTrigger value="public">{t("publicProfileTab")}</TabsTrigger>
          <TabsTrigger value="security">{t("security")}</TabsTrigger>
          <TabsTrigger value="sessions">{t("sessions")}</TabsTrigger>
        </TabsList>

        {/* Personal Tab */}
        <TabsContent value="personal" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("personalInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Avatar — direct upload (bucket seçimi yok). File picker
                   açar, CropDialog'dan geçer, multipart POST ile
                   /api/user/profile/avatar'a yükler ve user.image'i set
                   eder. */}
              <div className="flex items-center gap-4">
                <DirectAvatarUpload
                  uploadUrl="/api/user/profile/avatar"
                  defaultAspect="1:1"
                  onUploaded={handleAvatarUploaded}
                >
                  {({ onClick, disabled }) => (
                    <button
                      type="button"
                      onClick={onClick}
                      disabled={disabled || avatarUploading}
                      aria-label={t("changeAvatar")}
                      className="group relative block size-12 shrink-0 overflow-hidden rounded-full border bg-muted text-xs font-semibold uppercase text-muted-foreground disabled:opacity-60"
                    >
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={image}
                          alt={name || email}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center">
                          {(name || email || "?").slice(0, 2)}
                        </span>
                      )}
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-[9px] font-medium uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {t("changeAvatar")}
                      </span>
                      {(avatarUploading || disabled) && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            strokeWidth={2}
                            className="size-4 animate-spin text-white"
                          />
                        </span>
                      )}
                    </button>
                  )}
                </DirectAvatarUpload>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    {t("avatarHint")}
                  </p>
                  {image && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleAvatarRemove}
                      disabled={avatarUploading}
                      className="-ms-2 w-fit text-xs text-muted-foreground hover:text-destructive"
                    >
                      {t("removeAvatar")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t("name")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("email")}</Label>
                <Input value={email} disabled className="opacity-60" />
              </div>
              <Button
                className="w-fit"
                onClick={handleSaveProfile}
                disabled={saving || !name.trim()}
              >
                {saving && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Public Profile Tab — LinkedIn-style public profile editor */}
        <TabsContent value="public" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("publicProfileTitle")}</CardTitle>
              <CardDescription>
                {t("publicProfileDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Cover image — MediaManagerTrigger ile clickable banner.
                   Hover'da edit overlay, sağ üstte sadece "remove" görünür
                   (change zaten banner click ile çalışır). */}
              <div className="flex flex-col gap-2">
                <Label>{t("coverImage")}</Label>
                <div className="relative aspect-[4/1] w-full overflow-hidden rounded-md border bg-gradient-to-br from-muted via-muted/60 to-muted/30">
                  {sentroyClient ? (
                    <MediaManagerTrigger
                      client={sentroyClient}
                      accept="image/*"
                      maxItems={1}
                      title={t("coverPickerTitle")}
                      description={t("coverPickerDesc")}
                      confirmLabel={t("changeCover")}
                      onSelect={(media) => {
                        const raw = media[0]
                        if (!raw) return
                        const url = resolveMediaPickUrl(raw)
                        if (!url) {
                          toast.error(t("mediaPickNoUrl"))
                          return
                        }
                        setCoverImage(url)
                      }}
                      triggerClassName="block size-full"
                      trigger={
                        <span className="group relative block size-full">
                          {coverImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={coverImage}
                              alt=""
                              className="size-full object-cover"
                            />
                          )}
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
                            {t("changeCover")}
                          </span>
                        </span>
                      }
                    />
                  ) : (
                    coverImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverImage}
                        alt=""
                        className="size-full object-cover"
                      />
                    )
                  )}
                  {coverImage && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCoverImage(null)}
                      className="absolute right-2 top-2 z-10"
                    >
                      {t("removeCover")}
                    </Button>
                  )}
                </div>
              </div>

              {/* Slug */}
              <div className="flex flex-col gap-2">
                <Label>{t("profileSlug")}</Label>
                <div className="flex items-stretch overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring">
                  <span className="flex items-center px-3 text-xs text-muted-foreground bg-muted/40 font-mono">
                    /profile/u/
                  </span>
                  <Input
                    value={profileSlug}
                    onChange={(e) =>
                      setProfileSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "-")
                          .replace(/-+/g, "-"),
                      )
                    }
                    placeholder="your-name"
                    disabled={publicSaving}
                    className="border-0 font-mono shadow-none focus-visible:ring-0"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t("profileSlugHint")}
                </p>
              </div>

              {/* Headline */}
              <div className="flex flex-col gap-2">
                <Label>{t("headline")}</Label>
                <Input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder={t("headlinePlaceholder")}
                  disabled={publicSaving}
                  maxLength={120}
                />
              </div>

              {/* Bio */}
              <div className="flex flex-col gap-2">
                <Label>{t("bio")}</Label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t("bioPlaceholder")}
                  disabled={publicSaving}
                  rows={4}
                  maxLength={1024}
                  className="rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-[10px] text-muted-foreground">
                  {bio.length}/1024
                </p>
              </div>

              {/* Location + Website */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>{t("location")}</Label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Istanbul, Türkiye"
                    disabled={publicSaving}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("website")}</Label>
                  <Input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    disabled={publicSaving}
                  />
                </div>
              </div>

              {/* Social links — type select + URL input rows */}
              <div className="flex flex-col gap-2">
                <Label>{t("socialLinks")}</Label>
                <p className="text-[10px] text-muted-foreground">
                  {t("socialLinksHint")}
                </p>
                {socialLinks.length === 0 && (
                  <div className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
                    {t("socialLinksEmpty")}
                  </div>
                )}
                {socialLinks.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={link.type}
                      onChange={(e) =>
                        setSocialLinks((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, type: e.target.value } : l,
                          ),
                        )
                      }
                      disabled={publicSaving}
                      className="h-9 w-32 shrink-0 rounded-md border bg-transparent px-2 text-xs"
                    >
                      <option value="twitter">Twitter / X</option>
                      <option value="github">GitHub</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="instagram">Instagram</option>
                      <option value="youtube">YouTube</option>
                      <option value="facebook">Facebook</option>
                      <option value="mastodon">Mastodon</option>
                      <option value="email">Email</option>
                      <option value="other">Other</option>
                    </select>
                    <Input
                      value={link.url}
                      onChange={(e) =>
                        setSocialLinks((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, url: e.target.value } : l,
                          ),
                        )
                      }
                      placeholder={
                        link.type === "email"
                          ? "you@example.com"
                          : "https://..."
                      }
                      disabled={publicSaving}
                      className="flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        setSocialLinks((prev) =>
                          prev.filter((_, i) => i !== idx),
                        )
                      }
                      disabled={publicSaving}
                      title={t("removeSocialLink")}
                    >
                      <HugeiconsIcon
                        icon={Delete02Icon}
                        strokeWidth={2}
                        className="size-3.5"
                      />
                    </Button>
                  </div>
                ))}
                {socialLinks.length < 12 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSocialLinks((prev) => [
                        ...prev,
                        { type: "twitter", url: "" },
                      ])
                    }
                    disabled={publicSaving}
                    className="w-fit"
                  >
                    + {t("addSocialLink")}
                  </Button>
                )}
              </div>

              {/* Public toggle */}
              <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                <input
                  type="checkbox"
                  checked={isPublicProfile}
                  onChange={(e) => setIsPublicProfile(e.target.checked)}
                  disabled={publicSaving}
                  className="mt-0.5"
                  id="public-profile-toggle"
                />
                <label
                  htmlFor="public-profile-toggle"
                  className="flex flex-col gap-0.5 text-sm"
                >
                  <span className="font-medium">{t("isPublicProfile")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("isPublicProfileHint")}
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  className="w-fit"
                  onClick={handleSavePublicProfile}
                  disabled={publicSaving}
                >
                  {publicSaving && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  )}
                  {t("save")}
                </Button>
                {profileSlug && isPublicProfile && (
                  <a
                    href={`/profile/u/${profileSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline"
                  >
                    {t("viewPublicProfile")}
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="flex flex-col gap-4">
          {/* Password */}
          {(hasCredential && !!changePasswordOpen) && (
            <Card>
              <CardHeader className="relative">
                <CardTitle>{t("changePassword")}</CardTitle>
                <Button variant="ghost" size="sm" className="absolute right-2" onClick={() => setChangePasswordOpen(false)}>
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1} />
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t("currentPassword")}</Label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={changingPassword}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("newPassword")}</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={changingPassword}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("confirmPassword")}</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={changingPassword}
                  />
                </div>
                <Button
                  className="w-fit"
                  onClick={handleChangePassword}
                  disabled={
                    changingPassword ||
                    !currentPassword ||
                    !newPassword ||
                    !confirmPassword
                  }
                >
                  {changingPassword && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  )}
                  {t("changePassword")}
                </Button>
              </CardContent>
            </Card>
          )}

          

          {/* Linked accounts */}
          {!changePasswordOpen && (
            <>
              <Card>
            <CardHeader>
              <CardTitle>{t("linkedAccounts")}</CardTitle>
              <CardDescription>{t("linkedAccountsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {accountsLoading ? (
                <>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </>
              ) : (
                <>
                  {/* Credential (password) */}
                  <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
                    <HugeiconsIcon
                      icon={LockPasswordIcon}
                      strokeWidth={2}
                      className="size-5"
                    />
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-medium">
                        {t("emailPassword")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {email}
                      </span>
                    </div>
                    {hasCredential ? (
                      <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      >
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          strokeWidth={2}
                          className="size-3"
                        />
                        {t("connected")}
                      </Badge>
                      <Button variant="outline" size="sm" onClick={() => setChangePasswordOpen(true)}>
                        <HugeiconsIcon
                          icon={Key01Icon}
                          strokeWidth={2}
                          className="size-3"
                        />
                        {t("changePassword")}
                      </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSetPasswordOpen(true)}
                      >
                        <HugeiconsIcon
                          icon={Key01Icon}
                          strokeWidth={2}
                          className="size-3"
                        />
                        {t("setPassword")}
                      </Button>
                    )}
                  </div>

                  {/* Sosyal provider'lar — dinamik */}
                  {SOCIAL_PROVIDERS.map((p) => {
                    const account = accounts.find(
                      (a) => a.providerId === p.id,
                    )
                    const linking = linkingProvider === p.id
                    const unlinking = unlinkingProvider === p.id
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3"
                      >
                        <SocialProviderIcon
                          provider={p.id}
                          className="size-5 shrink-0"
                        />
                        <div className="flex flex-1 min-w-0 flex-col">
                          <span className="text-sm font-medium">{p.label}</span>
                          {account && (
                            <span className="truncate text-xs text-muted-foreground">
                              {account.accountId}
                            </span>
                          )}
                        </div>
                        {account ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={unlinking || !canUnlink}
                            title={!canUnlink ? t("cannotUnlinkLast") : undefined}
                            onClick={() =>
                              handleUnlinkProvider(p.id, account.accountId)
                            }
                          >
                            {unlinking && (
                              <HugeiconsIcon
                                icon={Loading03Icon}
                                strokeWidth={2}
                                className="animate-spin"
                                data-icon="inline-start"
                              />
                            )}
                            {t("unlink")}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={linking}
                            onClick={() => handleLinkProvider(p.id)}
                          >
                            {linking && (
                              <HugeiconsIcon
                                icon={Loading03Icon}
                                strokeWidth={2}
                                className="animate-spin"
                                data-icon="inline-start"
                              />
                            )}
                            {t("connect")}
                          </Button>
                        )}
                      </div>
                    )
                  })}

                  {/* Son kalan method'u koparma uyarısı */}
                  {!canUnlink && (
                    <p className="text-xs text-muted-foreground">
                      {t("cannotUnlinkLast")}
                    </p>
                  )}
                  
                </>
              )}
            </CardContent>
          </Card>
            </>
          )}


                {/* 2FA — yalnizca credential method bagli kullanicilar icin.
                    better-auth twoFactor plugin'i OAuth callback'lerini
                    intercept etmedigi icin Google-only kullanicilarda
                    2FA'yi aktif etmek yanlis guvenlik hissi olusturur. */}
                {!accountsLoading && hasCredential && (
                  <Card className="flex-row items-center justify-between gap-4 space-y-0">
                  <CardHeader className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} />
                        {t("twoFactor")}
                        {twoFactorEnabled && (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          >
                            <HugeiconsIcon
                              icon={Tick02Icon}
                              strokeWidth={2}
                              className="size-3"
                            />
                            {t("enabled")}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{t("twoFactorDesc")}</CardDescription>
                  </CardHeader>

                  <CardContent>
                  {twoFactorEnabled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDisableOpen(true)}
                      >
                        {t("twoFactorDisable")}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setSetupOpen(true)}>
                        {t("twoFactorEnable")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
                )}

                {/* Passkeys — şifresiz / 2FA-style; tarayıcı destekliyorsa
                    görünür, eklenen passkey'lerle login form üzerinden
                    direkt giriş yapılır. */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t("passkeysCardTitle")}</CardTitle>
                    <CardDescription>
                      {t("passkeysCardDescription")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PasskeySection />
                  </CardContent>
                </Card>

                {/* Danger zone — kalıcı hesap silme (e-posta kodu doğrulamalı).
                    Akış: kod iste (sahip olunan şirketler listelenir) → koddan
                    sonra kalıcı sil. Sunucu, sahibi olunan şirketleri tam
                    kaskadla (mail/storage/tüm veri) siler. */}
                <Card className="border-destructive/40">
                  <CardHeader>
                    <CardTitle className="text-destructive">{t("dangerZone")}</CardTitle>
                    <CardDescription>{t("deleteAccountDescription")}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {deleteState.phase === "idle" && (
                      <Button
                        variant="destructive"
                        className="w-fit"
                        disabled={deleteState.busy}
                        onClick={requestAccountDeletion}
                      >
                        {deleteState.busy ? t("deleteAccountSending") : t("deleteAccount")}
                      </Button>
                    )}
                    {deleteState.phase === "code" && (
                      <div className="flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground">
                          {t("deleteAccountCodeSent")}
                        </p>
                        {deleteState.ownedCompanies.length > 0 && (
                          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                            <p className="font-medium text-destructive">
                              {t("deleteAccountOwnedWarning", {
                                count: deleteState.ownedCompanies.length,
                              })}
                            </p>
                            <ul className="mt-1 list-inside list-disc text-muted-foreground">
                              {deleteState.ownedCompanies.map((c) => (
                                <li key={c.slug}>{c.name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Input
                            value={deleteState.code}
                            onChange={(e) =>
                              setDeleteState((s) => ({
                                ...s,
                                code: e.target.value.replace(/\D/g, "").slice(0, 6),
                              }))
                            }
                            inputMode="numeric"
                            placeholder="000000"
                            className="w-32 text-center font-mono tracking-[0.3em]"
                          />
                          <Button
                            variant="destructive"
                            disabled={deleteState.code.length !== 6 || deleteState.busy}
                            onClick={confirmAccountDeletion}
                          >
                            {deleteState.busy
                              ? t("deleteAccountDeleting")
                              : t("deleteAccountConfirm")}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={deleteState.busy}
                            onClick={() =>
                              setDeleteState({ phase: "idle", busy: false, code: "", ownedCompanies: [] })
                            }
                          >
                            {tCommon("cancel")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <div className="flex flex-col gap-1.5">
                <CardTitle>{t("sessions")}</CardTitle>
                <CardDescription>{t("sessionsDescription")}</CardDescription>
              </div>
              {hasOtherSessions && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevokeAll}
                  disabled={revokingAll}
                >
                  {revokingAll && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  )}
                  {t("revokeAll")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("device")}</TableHead>
                        <TableHead>{t("ipAddress")}</TableHead>
                        <TableHead>{t("location")}</TableHead>
                        <TableHead>{t("lastActive")}</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessions.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {parseUserAgent(s.userAgent)}
                              </span>
                              {s.isCurrent && (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                >
                                  {t("currentSession")}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {s.ipAddress || "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex flex-col">
                              <span>{getLocationString(s.ipInfo)}</span>
                              {getNetworkInfo(s.ipInfo) && (
                                <span className="text-[10px] text-muted-foreground/70">
                                  {getNetworkInfo(s.ipInfo)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatRelative(s.updatedAt)}
                          </TableCell>
                          <TableCell>
                            {!s.isCurrent && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={revokingId === s.id}
                                onClick={() => handleRevokeSession(s)}
                                title={t("revokeSession")}
                              >
                                <HugeiconsIcon
                                  icon={
                                    revokingId === s.id
                                      ? Loading03Icon
                                      : Delete02Icon
                                  }
                                  strokeWidth={2}
                                  className={
                                    revokingId === s.id
                                      ? "animate-spin"
                                      : undefined
                                  }
                                />
                                <span className="sr-only">
                                  {tCommon("delete")}
                                </span>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 2FA Dialogs */}
      <TwoFactorSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        hasCredential={hasCredential}
        onEnabled={() => {
          // Session'ı yenile — twoFactorEnabled flag'ı güncellensin
          setTimeout(() => {
            window.location.reload()
          }, 5000)
        }}
      />
      <TwoFactorDisableDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        hasCredential={hasCredential}
        onDisabled={() => window.location.reload()}
      />

      {/* OAuth-only kullanicilar icin ilk defa sifre olusturma */}
      <SetPasswordDialog
        open={setPasswordOpen}
        onOpenChange={setSetPasswordOpen}
        onSuccess={() => {
          fetchAccounts()
        }}
      />

    </PageTransition>
  )
}
