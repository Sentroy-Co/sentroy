"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Camera01Icon,
  Loading03Icon,
  ArrowUpRight01Icon,
  Globe02Icon,
  Shield01Icon,
  LockPasswordIcon,
  Logout01Icon,
  Delete02Icon,
  PlusSignIcon,
  Link01Icon,
} from "@hugeicons/core-free-icons"
import { useSession, authClient } from "@workspace/auth/client/auth-client"
import { SOCIAL_PROVIDERS } from "@workspace/auth/lib/social-providers"
import { SocialProviderIcon } from "@workspace/auth/components/social-provider-icon"
import { PasskeySection } from "@workspace/auth/components/passkey-section"
import { DirectAvatarUpload } from "@workspace/console/components/shared/direct-avatar-upload"
import { CompanyAvatar } from "@workspace/console/components/shared/company-avatar"
import { confirm } from "@workspace/console/stores/confirm"
import {
  TwoFactorSetupDialog,
  TwoFactorDisableDialog,
} from "@workspace/console/components/profile/two-factor-dialog"
import { SetPasswordDialog } from "@workspace/console/components/profile/set-password-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type { OsUser } from "../menu-bar"
import { Pane, PaneTitle, SectionLabel, Group, Row, EditRow, ToggleRow, PaneLoading } from "./ui"

/**
 * OS System Settings — NATIVE Profile pane (company-pane deseninde). Eskiden
 * `/profile?embed=1` iframe'iydi; artık macOS-tarzı section'lar. TÜM işlevler
 * korunur: kişisel + public profil alanları (EditRow), güvenlik (şifre/2FA/
 * passkey/bağlı hesaplar — mevcut dialog'lar aynen yeniden kullanılır) ve şık
 * oturum listesi (confirm store'lu iptal). Ağır güvenlik metinleri "profile"
 * namespace'inden (console.json) gelir; pane chrome'u "os".
 */

interface SocialLink {
  type: string
  url: string
}

interface ProfileData {
  name: string
  email: string
  image: string | null
  profileSlug: string | null
  bio: string | null
  headline: string | null
  location: string | null
  website: string | null
  isPublicProfile: boolean
  socialLinks: SocialLink[]
}

interface SessionData {
  id: string
  userAgent: string | null
  ipInfo: {
    city?: string
    region?: string
    country?: string
    as_name?: string
    [key: string]: unknown
  } | null
  updatedAt: string
  isCurrent?: boolean
}

interface LinkedAccount {
  id: string
  providerId: string
  accountId: string
}

const SOCIAL_TYPES = [
  "twitter",
  "github",
  "linkedin",
  "instagram",
  "youtube",
  "facebook",
  "mastodon",
  "email",
  "other",
] as const

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/

function parseUserAgent(ua: string | null): string {
  if (!ua) return ""
  if (ua.includes("Edg/")) return "Edge"
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera"
  if (ua.includes("Chrome")) return "Chrome"
  if (ua.includes("Firefox")) return "Firefox"
  if (ua.includes("Safari")) return "Safari"
  return ua.substring(0, 24)
}

function locationOf(ipInfo: SessionData["ipInfo"]): string {
  if (!ipInfo) return ""
  return [ipInfo.city, ipInfo.region, ipInfo.country]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(", ")
}

function relative(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

export function ProfilePane({ lang, user }: { lang: string; user: OsUser }) {
  const t = useTranslations("os")
  const tp = useTranslations("profile")
  const { data: session } = useSession()

  const [d, setD] = useState<ProfileData | null>(null)
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null)
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null)

  const [changePwOpen, setChangePwOpen] = useState(false)
  const [setPwOpen, setSetPwOpen] = useState(false)
  const [twoFaSetupOpen, setTwoFaSetupOpen] = useState(false)
  const [twoFaDisableOpen, setTwoFaDisableOpen] = useState(false)
  const [socialOpen, setSocialOpen] = useState(false)

  // Profil alanları
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch("/api/user/profile", { credentials: "include" })
        const j = await r.json()
        if (cancelled || !j.data) return
        const u = j.data
        setD({
          name: u.name ?? "",
          email: u.email ?? "",
          image: u.image ?? null,
          profileSlug: u.profileSlug ?? null,
          bio: u.bio ?? null,
          headline: u.headline ?? null,
          location: u.location ?? null,
          website: u.website ?? null,
          isPublicProfile: !!u.isPublicProfile,
          socialLinks: Array.isArray(u.socialLinks) ? u.socialLinks : [],
        })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Oturumlar + bağlı hesaplar
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [sr, ar] = await Promise.all([
          fetch("/api/user/sessions"),
          fetch("/api/user/accounts"),
        ])
        const sj = await sr.json()
        const aj = await ar.json()
        if (cancelled) return
        if (sr.ok) setSessions((sj.data as SessionData[]) ?? [])
        if (ar.ok) setAccounts((aj.data as LinkedAccount[]) ?? [])
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setTwoFactorEnabled(
      Boolean((session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled),
    )
  }, [session])

  async function refreshAccounts() {
    try {
      const r = await fetch("/api/user/accounts")
      const j = await r.json()
      if (r.ok) setAccounts((j.data as LinkedAccount[]) ?? [])
    } catch {
      /* ignore */
    }
  }

  async function patch(body: Record<string, unknown>) {
    const r = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || t("common.couldNotSave"))
    setD((prev) => (prev ? { ...prev, ...j.data } : prev))
    toast.success(t("common.saved"))
  }

  async function removePhoto() {
    try {
      const r = await fetch("/api/user/profile/avatar", { method: "DELETE" })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setD((prev) => (prev ? { ...prev, image: null } : prev))
      toast.success(tp("avatarRemoved"))
    } catch (x) {
      toast.error((x as Error)?.message || t("common.somethingWrong"))
    }
  }

  async function revokeSession(s: SessionData) {
    const ok = await confirm({
      title: t("profilePane.revokeConfirmTitle"),
      description: t("profilePane.revokeConfirmDesc"),
      confirmText: tp("revokeSession"),
      destructive: true,
    })
    if (!ok) return
    setRevokingId(s.id)
    try {
      const r = await fetch("/api/user/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: s.id }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setSessions((prev) => prev.filter((x) => x.id !== s.id))
      toast.success(tp("sessionRevoked"))
    } catch (x) {
      toast.error((x as Error)?.message || t("common.somethingWrong"))
    } finally {
      setRevokingId(null)
    }
  }

  async function revokeAll() {
    const ok = await confirm({
      title: tp("confirmRevokeAll"),
      description: tp("revokeAllDesc"),
      confirmText: tp("revokeAll"),
      destructive: true,
    })
    if (!ok) return
    try {
      const r = await fetch("/api/user/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeAll: true }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setSessions((prev) => prev.filter((s) => s.isCurrent))
      toast.success(tp("allRevoked"))
    } catch (x) {
      toast.error((x as Error)?.message || t("common.somethingWrong"))
    }
  }

  async function linkProvider(provider: string) {
    setLinkingProvider(provider)
    try {
      await authClient.linkSocial({
        provider: provider as "google" | "github",
        callbackURL: window.location.href,
      })
    } catch (x) {
      toast.error((x as Error)?.message || t("common.somethingWrong"))
      setLinkingProvider(null)
    }
  }

  async function unlinkProvider(provider: string, accountId: string) {
    const ok = await confirm({
      title: tp("confirmUnlink"),
      description: tp("confirmUnlinkDesc", { provider }),
      confirmText: tp("unlink"),
      destructive: true,
    })
    if (!ok) return
    setUnlinkingProvider(provider)
    try {
      const r = await fetch("/api/user/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider, accountId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      toast.success(tp("providerUnlinked"))
      void refreshAccounts()
    } catch (x) {
      toast.error((x as Error)?.message || t("common.somethingWrong"))
    } finally {
      setUnlinkingProvider(null)
    }
  }

  if (!d) return <PaneLoading />

  const hasCredential = accounts.some((a) => a.providerId === "credential")
  const canUnlink = accounts.length > 1
  const hasOtherSessions = sessions.some((s) => !s.isCurrent)
  // Public profil sayfası isPublicProfile:true gerektirir (aksi halde 404) —
  // link yalnız hem slug hem herkese-açık iken gösterilir.
  const publicUrl = d.profileSlug && d.isPublicProfile ? `/${lang}/profile/u/${d.profileSlug}` : null
  const socialCount = d.socialLinks.filter((s) => s.url?.trim()).length

  return (
    <Pane>
      <PaneTitle>{t("profilePane.title")}</PaneTitle>

      {/* Hero — avatar + ad + email */}
      <div className="mb-2 flex items-center gap-4 rounded-xl bg-card p-4 ring-1 ring-border/60">
        <DirectAvatarUpload
          uploadUrl="/api/user/profile/avatar"
          defaultAspect="1:1"
          onUploaded={(json) => {
            const img = (json as { data?: { image?: string | null } }).data?.image ?? null
            setD((prev) => (prev ? { ...prev, image: img } : prev))
            toast.success(tp("avatarUpdated"))
          }}
        >
          {({ onClick, disabled }) => (
            <button
              type="button"
              onClick={onClick}
              disabled={disabled}
              className="group relative size-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-border"
            >
              <CompanyAvatar name={d.name || user.name || user.email} avatarUrl={d.image} size="lg" className="size-full rounded-2xl" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <HugeiconsIcon icon={Camera01Icon} className="size-5 text-white" strokeWidth={2} />
              </span>
            </button>
          )}
        </DirectAvatarUpload>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-foreground">{d.name || t("account")}</p>
          <p className="truncate text-sm text-muted-foreground">{d.email}</p>
        </div>
        {d.image ? (
          <button
            type="button"
            onClick={removePhoto}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            {tp("removeAvatar")}
          </button>
        ) : null}
      </div>

      {/* Kişisel */}
      <SectionLabel>{t("profilePane.personal")}</SectionLabel>
      <Group>
        <EditRow
          label={t("profilePane.name")}
          value={d.name}
          placeholder={t("profilePane.addName")}
          onSave={(v) => patch({ name: v })}
          validate={(v) => (v ? null : t("profilePane.nameRequired"))}
        />
        <EditRow label={t("profilePane.headline")} value={d.headline || ""} placeholder={t("profilePane.headlinePh")} onSave={(v) => patch({ headline: v || null })} />
        <EditRow label={t("profilePane.bio")} value={d.bio || ""} placeholder={t("profilePane.bioPh")} multiline onSave={(v) => patch({ bio: v || null })} />
        <EditRow label={t("profilePane.location")} value={d.location || ""} placeholder={t("profilePane.locationPh")} onSave={(v) => patch({ location: v || null })} />
        <EditRow label={t("profilePane.website")} value={d.website || ""} placeholder={t("profilePane.websitePh")} onSave={(v) => patch({ website: v || null })} />
      </Group>

      {/* Public profil */}
      <SectionLabel>{t("profilePane.publicProfile")}</SectionLabel>
      <Group>
        <ToggleRow
          label={t("profilePane.publicProfile")}
          description={t("profilePane.publicProfileDesc")}
          checked={d.isPublicProfile}
          onChange={(v) => {
            setD((prev) => (prev ? { ...prev, isPublicProfile: v } : prev))
            void patch({ isPublicProfile: v }).catch((x) => {
              setD((prev) => (prev ? { ...prev, isPublicProfile: !v } : prev))
              toast.error((x as Error)?.message || t("common.somethingWrong"))
            })
          }}
        />
        <EditRow
          label={t("profilePane.profileUrl")}
          value={d.profileSlug || ""}
          placeholder={t("profilePane.handlePh")}
          dialogTitle={t("profilePane.profileUrlSlug")}
          validate={(v) => (!v || SLUG_RE.test(v) ? null : t("profilePane.handleInvalid"))}
          onSave={(v) => patch({ profileSlug: v || null })}
        />
        <Row
          label={t("profilePane.socialLinks")}
          description={t("profilePane.socialLinksDesc")}
          right={socialCount > 0 ? <span>{socialCount}</span> : undefined}
          onClick={() => setSocialOpen(true)}
        />
        {publicUrl ? (
          <Row
            label={t("profilePane.viewPublic")}
            right={<HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" strokeWidth={2} />}
            onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}
          />
        ) : null}
      </Group>

      {/* Güvenlik */}
      <SectionLabel>{t("profilePane.security")}</SectionLabel>
      <Group>
        <Row
          icon={LockPasswordIcon}
          iconColor="#8e8e93"
          label={hasCredential ? tp("changePassword") : tp("setPassword")}
          onClick={() => (hasCredential ? setChangePwOpen(true) : setSetPwOpen(true))}
        />
        {hasCredential ? (
          <Row
            icon={Shield01Icon}
            iconColor="#30d158"
            label={tp("twoFactor")}
            description={tp("twoFactorDesc")}
            right={
              <span className={cn("font-medium", twoFactorEnabled ? "text-emerald-500" : "text-muted-foreground")}>
                {twoFactorEnabled ? t("common.on") : t("common.off")}
              </span>
            }
            onClick={() => (twoFactorEnabled ? setTwoFaDisableOpen(true) : setTwoFaSetupOpen(true))}
          />
        ) : null}
      </Group>

      {/* Bağlı hesaplar */}
      <SectionLabel>{t("profilePane.connectedAccounts")}</SectionLabel>
      <Group>
        <div className="flex items-center gap-3 px-3.5 py-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#636366] text-white shadow-sm">
            <HugeiconsIcon icon={LockPasswordIcon} className="size-4" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{tp("emailPassword")}</span>
          {hasCredential ? (
            <span className="text-xs text-muted-foreground">{t("profilePane.connected")}</span>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSetPwOpen(true)}>
              {t("profilePane.connect")}
            </Button>
          )}
        </div>
        {SOCIAL_PROVIDERS.map((p) => {
          const account = accounts.find((a) => a.providerId === p.id)
          const connected = !!account
          const busy = linkingProvider === p.id || unlinkingProvider === p.id
          return (
            <div key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-card ring-1 ring-border/60">
                <SocialProviderIcon provider={p.id} className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.label}</span>
              {connected ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || !canUnlink}
                  title={!canUnlink ? tp("cannotUnlinkLast") : undefined}
                  onClick={() => unlinkProvider(p.id, account.accountId)}
                >
                  {busy ? <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" strokeWidth={2} /> : tp("unlink")}
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => linkProvider(p.id)}>
                  {busy ? <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" strokeWidth={2} /> : (
                    <>
                      <HugeiconsIcon icon={Link01Icon} className="size-3.5" strokeWidth={2} data-icon="inline-start" />
                      {t("profilePane.connect")}
                    </>
                  )}
                </Button>
              )}
            </div>
          )
        })}
      </Group>

      {/* Passkey'ler — mevcut self-contained bölüm */}
      <SectionLabel>{tp("passkeysCardTitle")}</SectionLabel>
      <div className="rounded-xl bg-card p-3.5 ring-1 ring-border/60">
        <PasskeySection />
      </div>

      {/* Aktif oturumlar */}
      <SectionLabel>{tp("sessions")}</SectionLabel>
      <Group>
        {sessions.length === 0 ? (
          <div className="px-3.5 py-4 text-center text-sm text-muted-foreground">{t("profilePane.noSessions")}</div>
        ) : (
          sessions.map((s) => {
            const browser = parseUserAgent(s.userAgent) || t("profilePane.unknownDevice")
            const loc = locationOf(s.ipInfo)
            const meta = [loc, relative(s.updatedAt)].filter(Boolean).join(" · ")
            return (
              <div key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#0a84ff] text-white shadow-sm">
                  <HugeiconsIcon icon={Globe02Icon} className="size-4" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-foreground">{browser}</span>
                    {s.isCurrent ? (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        {t("profilePane.thisDevice")}
                      </span>
                    ) : null}
                  </div>
                  {meta ? <div className="truncate text-xs text-muted-foreground">{meta}</div> : null}
                </div>
                {!s.isCurrent ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={revokingId === s.id}
                    title={tp("revokeSession")}
                    onClick={() => revokeSession(s)}
                  >
                    <HugeiconsIcon
                      icon={revokingId === s.id ? Loading03Icon : Logout01Icon}
                      className={cn("size-4", revokingId === s.id && "animate-spin")}
                      strokeWidth={2}
                    />
                  </Button>
                ) : null}
              </div>
            )
          })
        )}
      </Group>
      {hasOtherSessions ? (
        <Group className="mt-2 ring-red-500/30">
          <Row label={tp("revokeAll")} description={tp("revokeAllDesc")} danger onClick={revokeAll} />
        </Group>
      ) : null}

      {/* Dialog'lar — mevcut bileşenler aynen */}
      <ChangePasswordDialog open={changePwOpen} onOpenChange={setChangePwOpen} />
      <SetPasswordDialog open={setPwOpen} onOpenChange={setSetPwOpen} onSuccess={() => void refreshAccounts()} />
      <TwoFactorSetupDialog
        open={twoFaSetupOpen}
        onOpenChange={setTwoFaSetupOpen}
        hasCredential={hasCredential}
        onEnabled={() => setTwoFactorEnabled(true)}
      />
      <TwoFactorDisableDialog
        open={twoFaDisableOpen}
        onOpenChange={setTwoFaDisableOpen}
        hasCredential={hasCredential}
        onDisabled={() => setTwoFactorEnabled(false)}
      />
      <SocialLinksDialog
        open={socialOpen}
        onOpenChange={setSocialOpen}
        links={d.socialLinks}
        onSave={async (links) => {
          await patch({ socialLinks: links.filter((s) => s.url.trim().length > 0) })
        }}
      />
    </Pane>
  )
}

/** Şifre değiştir dialog'u — better-auth built-in /api/auth/change-password. */
function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const tp = useTranslations("profile")
  const tc = useTranslations("common")
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [busy, setBusy] = useState(false)

  function reset() {
    setCurrent("")
    setNext("")
    setConfirmPw("")
  }

  async function submit() {
    if (next.length < 8) {
      toast.error(tp("passwordMinLength"))
      return
    }
    if (next !== confirmPw) {
      toast.error(tp("passwordMismatch"))
      return
    }
    setBusy(true)
    try {
      const r = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Failed")
      toast.success(tp("passwordChanged"))
      onOpenChange(false)
      setTimeout(reset, 200)
    } catch (x) {
      toast.error((x as Error)?.message || "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : (onOpenChange(false), setTimeout(reset, 200)))}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tp("changePassword")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{tp("currentPassword")}</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={busy} autoFocus autoComplete="current-password" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{tp("newPassword")}</Label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} disabled={busy} autoComplete="new-password" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{tp("confirmPassword")}</Label>
            <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} disabled={busy} autoComplete="new-password" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !current || !next || !confirmPw}>
            {busy ? <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" strokeWidth={2} data-icon="inline-start" /> : null}
            {tp("changePassword")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Sosyal bağlantı editörü — tekrarlı satırlar (native select + url). */
function SocialLinksDialog({
  open,
  onOpenChange,
  links,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  links: SocialLink[]
  onSave: (links: SocialLink[]) => Promise<void>
}) {
  const t = useTranslations("os")
  const tc = useTranslations("common")
  const [draft, setDraft] = useState<SocialLink[]>(links)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setDraft(links.length ? links : [])
  }, [open, links])

  function update(i: number, patch: Partial<SocialLink>) {
    setDraft((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function save() {
    setBusy(true)
    try {
      await onSave(draft)
      onOpenChange(false)
    } catch (x) {
      // Dialog açık kalsın (taslak korunsun) + hatayı göster.
      toast.error((x as Error)?.message || t("common.couldNotSave"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("profilePane.socialLinksTitle")}</DialogTitle>
          <DialogDescription>{t("profilePane.socialLinksDesc")}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto os-scrollbar">
          {draft.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("profilePane.noSocialLinks")}</p>
          ) : (
            draft.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={l.type}
                  onChange={(e) => update(i, { type: e.target.value })}
                  className="h-9 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {SOCIAL_TYPES.map((tp) => (
                    <option key={tp} value={tp}>
                      {tp.charAt(0).toUpperCase() + tp.slice(1)}
                    </option>
                  ))}
                </select>
                <Input
                  value={l.url}
                  onChange={(e) => update(i, { url: e.target.value })}
                  placeholder={t("profilePane.linkUrlPh")}
                  className="flex-1"
                />
                <Button size="icon-sm" variant="ghost" onClick={() => setDraft((prev) => prev.filter((_, idx) => idx !== i))}>
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                </Button>
              </div>
            ))
          )}
        </div>
        {draft.length < 12 ? (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setDraft((prev) => [...prev, { type: "twitter", url: "" }])}
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" strokeWidth={2} data-icon="inline-start" />
            {t("profilePane.addLink")}
          </Button>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? t("common.saving") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
