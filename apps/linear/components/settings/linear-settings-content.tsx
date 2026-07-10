"use client"

/**
 * Linear Ayarları — Apple (macOS/iOS) Ayarlar deseni (tam redesign).
 *
 * Yapı: yuvarlatılmış GRUP konteynerleri içinde SATIRLAR (label + mevcut
 * değer özeti/maskeli + chevron), separator'lı. Düzenlenebilir satıra
 * tıklayınca DIALOG açılır; dialog içi Kaydet yalnız o alanı PUT eder
 * (route partial PUT destekler) → toast + optimistic local patch.
 * TOGGLE'lar satır içi switch — değişince ANINDA PUT; hata olursa geri
 * alınır. Sayfada section-level Save YOKTUR.
 *
 * base-ui notları: DialogTrigger kullanılmaz (controlled open state),
 * SelectValue kullanılmaz (manuel label render — proje kuralı).
 *
 * Secret'lar write-only: server yalnız prefix/son-4 döner; girilen değer
 * PUT ile gider, geri okunamaz.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { useDashPaths } from "@/lib/router-compat"
import { UI_FLAG_KEYS, type UiFlags } from "@/lib/ui-flags"
import { osSwitchSection } from "@/lib/os-embed"

export type TeamOption = { id: string; key: string; name: string }

export interface LinearSettingsData {
  connected: boolean
  apiKeyPrefix: string | null
  panelLabelName: string
  defaultTeamId: string | null
  defaultLabelName: string | null
  defaultStateName: string | null
  actorApp: boolean
  storageProvider: "linear" | "sentroy"
  sentroyApiKeyPrefix: string | null
  sentroyBucketId: string | null
  sentroyCompanySlug: string | null
  sentroyBaseUrl: string | null
  uiFlags: UiFlags
  webhookId: string | null
  /** ISO string (server serialize eder). */
  lastWebhookAt: string | null
  webhookEndpoint: string
  vaultConfigured: boolean
  telegram: TelegramSettingsData
}

/** Zengin operatör kaydı — server resolveOperators ile legacy'yi map'leyip döner. */
export interface TelegramOperatorData {
  tgUserId: string
  tgUsername: string | null
  tgDisplayName: string | null
  /** Opsiyonel Sentroy şirket kullanıcısı eşlemesi (boş bırakılabilir). */
  memberUserId: string | null
  canCreate: boolean
  canListAll: boolean
  canCancel: boolean
  /** "all" → tüm takımlar; <teamId> → tek takım; null → erişim yok. */
  teamAccess: "all" | string | null
}

/** Telegram bot ayarları — token yalnız maskeli (son 4 karakter) gelir. */
export interface TelegramSettingsData {
  enabled: boolean
  botTokenLast4: string | null
  operators: TelegramOperatorData[]
  defaultTeamId: string | null
  /** Bot dili — default "en". */
  language: "en" | "tr"
  /** ISO string (server serialize eder) — son başarılı poll zamanı. */
  lastPolledAt: string | null
  /** Aktif keşif (dinleme) penceresi bitişi — ISO string; aktif değilse null. */
  discoveryActiveUntil: string | null
}

/** Operatör ↔ şirket kullanıcısı eşleme Select'i için üye seçeneği. */
export type MemberOption = { userId: string; name: string; email: string }

/** PUT /linear-settings — hata mesajını Error olarak fırlatır. */
async function putSettings(
  apiBase: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${apiBase}/linear-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(json?.error || `HTTP ${res.status}`)
  }
}

/* --------------------------- Apple form yapı taşları ---------------------- */

/** Yuvarlatılmış grup konteyneri — satırlar divide-y ile ayrılır. */
function SettingsGroup({
  title,
  footer,
  children,
}: {
  title?: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      {title ? (
        <h2 className="px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
      ) : null}
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {children}
      </div>
      {footer ? (
        <div className="px-4 text-xs text-muted-foreground">{footer}</div>
      ) : null}
    </section>
  )
}

/**
 * Ayar satırı. `onClick` verilirse tıklanabilir (chevron'lu) — dialog açar;
 * verilmezse statik satır (örn. toggle `trailing` ile).
 */
function SettingsRow({
  label,
  hint,
  value,
  onClick,
  trailing,
  disabled,
  leading,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  value?: React.ReactNode
  onClick?: () => void
  trailing?: React.ReactNode
  disabled?: boolean
  leading?: React.ReactNode
}) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{label}</div>
        {hint ? (
          <div className="truncate text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      {value != null ? (
        <div className="max-w-[45%] truncate text-sm text-muted-foreground">
          {value}
        </div>
      ) : null}
      {trailing}
      {onClick ? (
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className="size-4 shrink-0 text-muted-foreground/60"
          strokeWidth={2}
        />
      ) : null}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
      >
        {inner}
      </button>
    )
  }
  return <div className="flex items-center gap-3 px-4 py-3">{inner}</div>
}

/** Apple tarzı satır içi toggle — değişince ANINDA kaydedilir (dialog yok). */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <SettingsRow
      label={label}
      hint={hint}
      trailing={
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      }
    />
  )
}

/** Tek-alan düzenleme dialog'u — Kaydet/İptal footer'lı, controlled. */
function EditDialog({
  open,
  onOpenChange,
  title,
  description,
  onSave,
  saving,
  saveLabel,
  saveDisabled,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  onSave: () => void
  saving: boolean
  saveLabel?: string
  saveDisabled?: boolean
  children: React.ReactNode
}) {
  const t = useTranslations("linearLite.settings.common")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-4">{children}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={onSave} disabled={saving || saveDisabled}>
            {saving ? t("saving") : (saveLabel ?? t("save"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------- Sayfa ---------------------------------- */

export function LinearSettingsContent({
  settings,
  teams,
  members = [],
}: {
  settings: LinearSettingsData
  teams: TeamOption[]
  /** Şirket üyeleri — operatör eşleme Select'i (opsiyonel, boş olabilir). */
  members?: MemberOption[]
}) {
  const t = useTranslations("linearLite.settings")
  const { apiBase } = useDashPaths()
  const router = useRouter()
  const disabled = !settings.vaultConfigured

  // Optimistic yerel kopya — her başarılı PUT sonrası patch'lenir; server
  // sync için ayrıca router.refresh() çağrılır.
  const [s, setS] = React.useState<LinearSettingsData>(settings)

  /** Partial PUT + optimistic patch + toast. Hatada throw (çağıran geri alır). */
  const save = React.useCallback(
    async (
      payload: Record<string, unknown>,
      patch: Partial<LinearSettingsData>,
      successText: string,
    ) => {
      await putSettings(apiBase, payload)
      setS((prev) => ({ ...prev, ...patch }))
      toast.success(successText)
      router.refresh()
    },
    [apiBase, router],
  )

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 pb-10">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {disabled ? (
        <Alert variant="destructive">
          <AlertTitle>{t("vaultWarning.title")}</AlertTitle>
          <AlertDescription>{t("vaultWarning.description")}</AlertDescription>
        </Alert>
      ) : null}

      <ConnectionGroup s={s} teams={teams} save={save} disabled={disabled} />
      <WebhookGroup
        s={s}
        apiBase={apiBase}
        onChanged={() => router.refresh()}
        disabled={disabled}
      />
      <StorageGroup s={s} save={save} disabled={disabled} />
      <AppearanceGroups s={s} setS={setS} apiBase={apiBase} disabled={disabled} />
      <TelegramGroups
        s={s}
        teams={teams}
        members={members}
        apiBase={apiBase}
        save={save}
        disabled={disabled}
      />
    </div>
  )
}

type SaveFn = (
  payload: Record<string, unknown>,
  patch: Partial<LinearSettingsData>,
  successText: string,
) => Promise<void>

/* ----------------------------- Bağlantı grubu ----------------------------- */

function ConnectionGroup({
  s,
  teams,
  save,
  disabled,
}: {
  s: LinearSettingsData
  teams: TeamOption[]
  save: SaveFn
  disabled: boolean
}) {
  const t = useTranslations("linearLite.settings.connection")
  const tc = useTranslations("linearLite.settings.common")

  const [dialog, setDialog] = React.useState<
    null | "apiKey" | "panelLabel" | "team" | "label" | "state"
  >(null)
  const [saving, setSaving] = React.useState(false)

  // Dialog form state'leri — dialog açılırken mevcut değerle doldurulur.
  const [apiKeyInput, setApiKeyInput] = React.useState("")
  const [panelLabel, setPanelLabel] = React.useState(s.panelLabelName)
  const [teamId, setTeamId] = React.useState<string | null>(s.defaultTeamId)
  const [labelName, setLabelName] = React.useState(s.defaultLabelName ?? "")
  const [stateName, setStateName] = React.useState(s.defaultStateName ?? "")

  const selectedTeam = teams.find((team) => team.id === teamId) ?? null
  const currentTeam = teams.find((team) => team.id === s.defaultTeamId) ?? null

  async function run(fn: () => Promise<void>) {
    setSaving(true)
    try {
      await fn()
      setDialog(null)
    } catch (err) {
      toast.error(t("saveError"), {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <SettingsGroup title={t("title")} footer={t("description")}>
        <SettingsRow
          label={t("apiKeyLabel")}
          value={
            s.apiKeyPrefix ? (
              <span className="font-mono">{s.apiKeyPrefix}…</span>
            ) : (
              t("statusNotConnected")
            )
          }
          trailing={
            s.connected ? (
              <Badge variant="secondary">{t("statusConnected")}</Badge>
            ) : undefined
          }
          onClick={() => {
            setApiKeyInput("")
            setDialog("apiKey")
          }}
          disabled={disabled}
        />
        <SettingsRow
          label={t("panelLabelLabel")}
          value={s.panelLabelName}
          onClick={() => {
            setPanelLabel(s.panelLabelName)
            setDialog("panelLabel")
          }}
          disabled={disabled}
        />
        <SettingsRow
          label={t("teamLabel")}
          value={
            currentTeam ? `${currentTeam.name} (${currentTeam.key})` : t("teamNone")
          }
          onClick={() => {
            setTeamId(s.defaultTeamId)
            setDialog("team")
          }}
          disabled={disabled || !s.connected}
        />
        <SettingsRow
          label={t("defaultLabelLabel")}
          value={s.defaultLabelName ?? tc("notSet")}
          onClick={() => {
            setLabelName(s.defaultLabelName ?? "")
            setDialog("label")
          }}
          disabled={disabled}
        />
        <SettingsRow
          label={t("defaultStateLabel")}
          value={s.defaultStateName ?? tc("notSet")}
          onClick={() => {
            setStateName(s.defaultStateName ?? "")
            setDialog("state")
          }}
          disabled={disabled}
        />
        <ToggleRow
          label={t("actorAppLabel")}
          hint={t("actorAppHint")}
          checked={s.actorApp}
          disabled={disabled}
          onChange={(value) =>
            void save({ actorApp: value }, { actorApp: value }, t("saved")).catch(
              (err) =>
                toast.error(t("saveError"), {
                  description: err instanceof Error ? err.message : undefined,
                }),
            )
          }
        />
      </SettingsGroup>

      {/* API key dialog — write-only */}
      <EditDialog
        open={dialog === "apiKey"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("apiKeyLabel")}
        description={t("apiKeyHint")}
        saving={saving}
        saveLabel={t("saveVerify")}
        saveDisabled={!apiKeyInput.trim()}
        onSave={() =>
          run(async () => {
            const key = apiKeyInput.trim()
            await save(
              { apiKey: key },
              { connected: true, apiKeyPrefix: key.slice(0, 12) },
              t("saved"),
            )
            // OS embed: bağlantı kuruldu → overview arka planda tazelensin.
            osSwitchSection("", { reload: true, switch: false })
          })
        }
      >
        {s.apiKeyPrefix ? (
          <div className="text-sm text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              {s.apiKeyPrefix}…
            </Badge>
          </div>
        ) : null}
        <Input
          type="password"
          autoComplete="off"
          placeholder={t("apiKeyPlaceholder")}
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
        />
      </EditDialog>

      {/* Panel etiketi */}
      <EditDialog
        open={dialog === "panelLabel"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("panelLabelLabel")}
        description={t("panelLabelHint")}
        saving={saving}
        saveDisabled={!panelLabel.trim()}
        onSave={() =>
          run(() =>
            save(
              { panelLabelName: panelLabel.trim() },
              { panelLabelName: panelLabel.trim() },
              t("saved"),
            ),
          )
        }
      >
        <Input value={panelLabel} onChange={(e) => setPanelLabel(e.target.value)} />
      </EditDialog>

      {/* Varsayılan takım — manuel label render, SelectValue YOK */}
      <EditDialog
        open={dialog === "team"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("teamLabel")}
        saving={saving}
        onSave={() =>
          run(() =>
            save({ defaultTeamId: teamId }, { defaultTeamId: teamId }, t("saved")),
          )
        }
      >
        <Select
          value={teamId ?? "none"}
          onValueChange={(value) =>
            setTeamId(!value || value === "none" ? null : value)
          }
        >
          <SelectTrigger>
            {selectedTeam ? (
              <span>
                {selectedTeam.name}{" "}
                <span className="text-muted-foreground">({selectedTeam.key})</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{t("teamNone")}</span>
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("teamNone")}</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name} ({team.key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {teams.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("teamEmptyHint")}</p>
        ) : null}
      </EditDialog>

      {/* Varsayılan etiket */}
      <EditDialog
        open={dialog === "label"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("defaultLabelLabel")}
        saving={saving}
        onSave={() =>
          run(() =>
            save(
              { defaultLabelName: labelName.trim() || null },
              { defaultLabelName: labelName.trim() || null },
              t("saved"),
            ),
          )
        }
      >
        <Input
          value={labelName}
          placeholder={t("defaultLabelPlaceholder")}
          onChange={(e) => setLabelName(e.target.value)}
        />
      </EditDialog>

      {/* Varsayılan durum */}
      <EditDialog
        open={dialog === "state"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("defaultStateLabel")}
        saving={saving}
        onSave={() =>
          run(() =>
            save(
              { defaultStateName: stateName.trim() || null },
              { defaultStateName: stateName.trim() || null },
              t("saved"),
            ),
          )
        }
      >
        <Input
          value={stateName}
          placeholder={t("defaultStatePlaceholder")}
          onChange={(e) => setStateName(e.target.value)}
        />
      </EditDialog>
    </>
  )
}

/* ------------------------------ Webhook grubu ------------------------------ */

function WebhookGroup({
  s,
  apiBase,
  onChanged,
  disabled,
}: {
  s: LinearSettingsData
  apiBase: string
  onChanged: () => void
  disabled: boolean
}) {
  const t = useTranslations("linearLite.settings.webhook")
  const locale = useLocale()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState<"setup" | "remove" | null>(null)

  const active = Boolean(s.webhookId)

  async function callWebhookEndpoint(method: "POST" | "DELETE") {
    const res = await fetch(`${apiBase}/linear-settings/webhook`, { method })
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        error?: string
      } | null
      throw new Error(json?.error || `HTTP ${res.status}`)
    }
  }

  async function handle(action: "setup" | "remove") {
    setPending(action)
    try {
      await callWebhookEndpoint(action === "setup" ? "POST" : "DELETE")
      toast.success(action === "setup" ? t("setupSuccess") : t("removeSuccess"))
      setOpen(false)
      onChanged()
    } catch (err) {
      toast.error(t("error"), {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setPending(null)
    }
  }

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(s.webhookEndpoint)
      toast.success(t("copied"))
    } catch {
      // Clipboard izni yoksa sessizce geç — endpoint dialog'da seçilebilir.
    }
  }

  return (
    <>
      <SettingsGroup title={t("title")} footer={t("description")}>
        <SettingsRow
          label={t("title")}
          value={
            <>
              {active ? t("statusActive") : t("statusMissing")}
              {" · "}
              {s.lastWebhookAt
                ? new Date(s.lastWebhookAt).toLocaleString(locale)
                : t("lastEventNever")}
            </>
          }
          onClick={() => setOpen(true)}
          disabled={disabled}
        />
      </SettingsGroup>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("endpointLabel")}</Label>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
                  {s.webhookEndpoint}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyEndpoint}
                >
                  {t("copy")}
                </Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {t("lastEventLabel")}{" "}
              <span className="text-foreground">
                {s.lastWebhookAt
                  ? new Date(s.lastWebhookAt).toLocaleString(locale)
                  : t("lastEventNever")}
              </span>
            </div>
            {!s.connected ? (
              <p className="text-xs text-muted-foreground">
                {t("notConnectedHint")}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            {active ? (
              <Button
                variant="outline"
                onClick={() => handle("remove")}
                disabled={pending !== null}
              >
                {t("remove")}
              </Button>
            ) : null}
            <Button
              onClick={() => handle("setup")}
              disabled={disabled || !s.connected || pending !== null}
            >
              {active ? t("renew") : t("setup")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ------------------------------ Depolama grubu ----------------------------- */

const PROVIDERS = ["linear", "sentroy"] as const

function StorageGroup({
  s,
  save,
  disabled,
}: {
  s: LinearSettingsData
  save: SaveFn
  disabled: boolean
}) {
  const t = useTranslations("linearLite.settings.storage")
  const tc = useTranslations("linearLite.settings.common")

  const [dialog, setDialog] = React.useState<
    null | "provider" | "token" | "bucket" | "slug" | "baseUrl"
  >(null)
  const [saving, setSaving] = React.useState(false)

  const [provider, setProvider] = React.useState<"linear" | "sentroy">(
    s.storageProvider,
  )
  const [tokenInput, setTokenInput] = React.useState("")
  const [bucketId, setBucketId] = React.useState(s.sentroyBucketId ?? "")
  const [companySlug, setCompanySlug] = React.useState(s.sentroyCompanySlug ?? "")
  const [baseUrl, setBaseUrl] = React.useState(s.sentroyBaseUrl ?? "")

  const providerLabels: Record<(typeof PROVIDERS)[number], string> = {
    linear: t("providerLinear"),
    sentroy: t("providerSentroy"),
  }

  async function run(fn: () => Promise<void>) {
    setSaving(true)
    try {
      await fn()
      setDialog(null)
    } catch (err) {
      toast.error(t("saveError"), {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <SettingsGroup
        title={t("title")}
        footer={
          s.storageProvider === "sentroy" ? t("sentroyHint") : t("providerHint")
        }
      >
        <SettingsRow
          label={t("providerLabel")}
          value={providerLabels[s.storageProvider]}
          onClick={() => {
            setProvider(s.storageProvider)
            setDialog("provider")
          }}
          disabled={disabled}
        />
        {s.storageProvider === "sentroy" ? (
          <>
            <SettingsRow
              label={t("apiKeyLabel")}
              value={
                s.sentroyApiKeyPrefix ? (
                  <span className="font-mono">{s.sentroyApiKeyPrefix}…</span>
                ) : (
                  tc("notSet")
                )
              }
              onClick={() => {
                setTokenInput("")
                setDialog("token")
              }}
              disabled={disabled}
            />
            <SettingsRow
              label={t("bucketLabel")}
              value={s.sentroyBucketId ?? tc("notSet")}
              onClick={() => {
                setBucketId(s.sentroyBucketId ?? "")
                setDialog("bucket")
              }}
              disabled={disabled}
            />
            <SettingsRow
              label={t("companySlugLabel")}
              value={s.sentroyCompanySlug ?? tc("notSet")}
              onClick={() => {
                setCompanySlug(s.sentroyCompanySlug ?? "")
                setDialog("slug")
              }}
              disabled={disabled}
            />
            <SettingsRow
              label={t("baseUrlLabel")}
              value={s.sentroyBaseUrl ?? "sentroy.com"}
              onClick={() => {
                setBaseUrl(s.sentroyBaseUrl ?? "")
                setDialog("baseUrl")
              }}
              disabled={disabled}
            />
          </>
        ) : null}
      </SettingsGroup>

      {/* Sağlayıcı — manuel label render, SelectValue YOK */}
      <EditDialog
        open={dialog === "provider"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("providerLabel")}
        description={t("providerHint")}
        saving={saving}
        onSave={() =>
          run(() =>
            save(
              { storageProvider: provider },
              { storageProvider: provider },
              t("saved"),
            ),
          )
        }
      >
        <Select
          value={provider}
          onValueChange={(value) => {
            if (value === "linear" || value === "sentroy") setProvider(value)
          }}
        >
          <SelectTrigger>
            <span>{providerLabels[provider]}</span>
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((value) => (
              <SelectItem key={value} value={value}>
                {providerLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </EditDialog>

      {/* Sentroy token — write-only */}
      <EditDialog
        open={dialog === "token"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("apiKeyLabel")}
        saving={saving}
        saveDisabled={!tokenInput.trim()}
        onSave={() =>
          run(() =>
            save(
              { sentroyApiKey: tokenInput.trim() },
              { sentroyApiKeyPrefix: tokenInput.trim().slice(0, 12) },
              t("saved"),
            ),
          )
        }
      >
        <Input
          type="password"
          autoComplete="off"
          placeholder={t("apiKeyPlaceholder")}
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
        />
      </EditDialog>

      <EditDialog
        open={dialog === "bucket"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("bucketLabel")}
        saving={saving}
        onSave={() =>
          run(() =>
            save(
              { sentroyBucketId: bucketId.trim() || null },
              { sentroyBucketId: bucketId.trim() || null },
              t("saved"),
            ),
          )
        }
      >
        <Input
          value={bucketId}
          placeholder={t("bucketPlaceholder")}
          onChange={(e) => setBucketId(e.target.value)}
        />
      </EditDialog>

      <EditDialog
        open={dialog === "slug"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("companySlugLabel")}
        saving={saving}
        onSave={() =>
          run(() =>
            save(
              { sentroyCompanySlug: companySlug.trim() || null },
              { sentroyCompanySlug: companySlug.trim() || null },
              t("saved"),
            ),
          )
        }
      >
        <Input
          value={companySlug}
          placeholder={t("companySlugPlaceholder")}
          onChange={(e) => setCompanySlug(e.target.value)}
        />
      </EditDialog>

      <EditDialog
        open={dialog === "baseUrl"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("baseUrlLabel")}
        saving={saving}
        onSave={() =>
          run(() =>
            save(
              { sentroyBaseUrl: baseUrl.trim() || null },
              { sentroyBaseUrl: baseUrl.trim() || null },
              t("saved"),
            ),
          )
        }
      >
        <Input
          value={baseUrl}
          placeholder="https://sentroy.com"
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </EditDialog>
    </>
  )
}

/* --------------------------- Görünüm / davranış ---------------------------- */

const FLAG_GROUPS: {
  key: "view" | "display" | "behavior" | "notifications"
  flags: (keyof UiFlags)[]
}[] = [
  { key: "view", flags: ["groupByTeam", "showAllIssues"] },
  {
    key: "display",
    flags: [
      "showStatus",
      "showAssignee",
      "showLabels",
      "showLinkedIssues",
      "showTeamPicker",
      "showArchive",
    ],
  },
  { key: "behavior", flags: ["kanbanDnd", "kanbanQuickAdd", "listDnd"] },
  {
    key: "notifications",
    flags: ["notifyCompleted", "notifyAssigned", "notifyCreated", "notifyComment"],
  },
]

function AppearanceGroups({
  s,
  setS,
  apiBase,
  disabled,
}: {
  s: LinearSettingsData
  setS: React.Dispatch<React.SetStateAction<LinearSettingsData>>
  apiBase: string
  disabled: boolean
}) {
  const t = useTranslations("linearLite.settings.appearance")

  // Toggle anında kaydedilir; hata olursa geri alınır (Apple deseni).
  async function toggleFlag(key: keyof UiFlags) {
    const previous = s.uiFlags
    const next = { ...previous, [key]: !previous[key] }
    setS((prev) => ({ ...prev, uiFlags: next }))
    try {
      await putSettings(apiBase, { uiFlags: next })
    } catch (err) {
      setS((prev) => ({ ...prev, uiFlags: previous }))
      toast.error(t("saveError"), {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <>
      {FLAG_GROUPS.map((group, index) => (
        <SettingsGroup
          key={group.key}
          title={t(`groups.${group.key}`)}
          footer={index === 0 ? t("description") : undefined}
        >
          {group.flags
            .filter((flag) => UI_FLAG_KEYS.includes(flag))
            .map((flag) => (
              <ToggleRow
                key={flag}
                label={t(`flags.${flag}`)}
                checked={s.uiFlags[flag]}
                disabled={disabled}
                onChange={() => void toggleFlag(flag)}
              />
            ))}
        </SettingsGroup>
      ))}
    </>
  )
}

/* ------------------------------ Telegram grubu ----------------------------- */

type SeenUserRow = {
  tgUserId: string
  tgUsername: string | null
  tgDisplayName: string | null
  lastSeenAt: string
}

/** Operatörün görünen adı: ad → @username → ID. */
function operatorLabel(op: TelegramOperatorData): string {
  return (
    op.tgDisplayName || (op.tgUsername ? `@${op.tgUsername}` : "") || op.tgUserId
  )
}

// Baş harf avatarı için sabit palet — tgUserId'den deterministik seçim.
const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-green-600",
  "bg-teal-600",
  "bg-blue-600",
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
]

function OperatorAvatar({ op }: { op: TelegramOperatorData }) {
  const digits = Number(op.tgUserId.slice(-4)) || 0
  const color = AVATAR_COLORS[digits % AVATAR_COLORS.length]
  const initial = operatorLabel(op).replace(/^@/, "").charAt(0).toUpperCase()
  return (
    <div
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-white ${color}`}
    >
      {initial || "?"}
    </div>
  )
}

function TelegramGroups({
  s,
  teams,
  members,
  apiBase,
  save,
  disabled,
}: {
  s: LinearSettingsData
  teams: TeamOption[]
  members: MemberOption[]
  apiBase: string
  save: SaveFn
  disabled: boolean
}) {
  const t = useTranslations("linearLite.settings.telegram")
  const tc = useTranslations("linearLite.settings.common")
  const locale = useLocale()
  const tg = s.telegram

  const [dialog, setDialog] = React.useState<
    null | "token" | "language" | "addOperator"
  >(null)
  const [saving, setSaving] = React.useState(false)
  const [tokenInput, setTokenInput] = React.useState("")
  const [language, setLanguage] = React.useState<"en" | "tr">(tg.language)
  const [newOperatorId, setNewOperatorId] = React.useState("")
  const [editingOperator, setEditingOperator] = React.useState<string | null>(
    null,
  )

  // --- Keşif (dinleme modu) -------------------------------------------------
  const [discoveryUntil, setDiscoveryUntil] = React.useState<string | null>(
    tg.discoveryActiveUntil,
  )
  const [seen, setSeen] = React.useState<SeenUserRow[]>([])
  const [discoveryBusy, setDiscoveryBusy] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())
  const discoveryActive = Boolean(
    discoveryUntil && new Date(discoveryUntil).getTime() > now,
  )

  // Geri sayım göstergesi — yalnız pencere aktifken saniyelik tick.
  React.useEffect(() => {
    if (!discoveryActive) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [discoveryActive])

  // Aktifken 5 sn'de bir seen listesini poll'la (server truth'u yansıt).
  React.useEffect(() => {
    if (!discoveryActive) return
    let stopped = false
    async function poll() {
      try {
        const res = await fetch(`${apiBase}/linear-settings/telegram-seen`)
        if (!res.ok || stopped) return
        const json = (await res.json()) as {
          data?: {
            discoveryActive?: boolean
            discoveryActiveUntil?: string | null
            seen?: SeenUserRow[]
          }
        }
        if (stopped) return
        setSeen(json.data?.seen ?? [])
        setDiscoveryUntil(
          json.data?.discoveryActive
            ? (json.data?.discoveryActiveUntil ?? null)
            : null,
        )
      } catch {
        // Poll hatası sessiz — bir sonraki turda tekrar denenir.
      }
    }
    void poll()
    const id = setInterval(() => void poll(), 5_000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [discoveryActive, apiBase])

  const languageLabels: Record<"en" | "tr", string> = {
    en: t("languageEn"),
    tr: t("languageTr"),
  }

  function teamAccessText(access: TelegramOperatorData["teamAccess"]): string {
    if (access === "all") return t("teamAccessAll")
    if (!access) return t("teamAccessNone")
    const team = teams.find((tm) => tm.id === access)
    return team ? team.name : access
  }

  function operatorSummary(op: TelegramOperatorData): string {
    const permCount = [op.canCreate, op.canListAll, op.canCancel].filter(
      Boolean,
    ).length
    const parts = [
      t("operatorPerms", { count: permCount }),
      teamAccessText(op.teamAccess),
    ]
    if (op.memberUserId) {
      const member = members.find((m) => m.userId === op.memberUserId)
      parts.push(member ? member.name || member.email : t("memberLinked"))
    }
    return parts.join(" · ")
  }

  async function run(fn: () => Promise<void>) {
    setSaving(true)
    try {
      await fn()
      setDialog(null)
    } catch (err) {
      toast.error(t("saveError"), {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  /** Operatör listesini kaydet — tek PUT, optimistic patch. */
  const saveOperators = React.useCallback(
    async (next: TelegramOperatorData[], successText: string) => {
      await save(
        { telegram: { operators: next } },
        { telegram: { ...tg, operators: next } },
        successText,
      )
    },
    [save, tg],
  )

  async function toggleEnabled(value: boolean) {
    try {
      await save(
        { telegram: { enabled: value } },
        { telegram: { ...tg, enabled: value } },
        t("saved"),
      )
    } catch (err) {
      toast.error(t("saveError"), {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  async function toggleDiscovery(start: boolean) {
    setDiscoveryBusy(true)
    try {
      await putSettings(apiBase, { telegram: { discovery: start } })
      if (start) {
        // Server 5 dk pencere açar; poll gerçek bitişi düzeltir.
        setDiscoveryUntil(new Date(Date.now() + 5 * 60_000).toISOString())
      } else {
        setDiscoveryUntil(null)
      }
      setSeen([])
    } catch (err) {
      toast.error(t("discoveryError"), {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setDiscoveryBusy(false)
    }
  }

  /** Seen listesinden operatör ekle — HEMEN kaydedilir (teamAccess null başlar). */
  async function addFromSeen(user: SeenUserRow) {
    if (tg.operators.some((o) => o.tgUserId === user.tgUserId)) {
      toast.error(t("operatorDuplicate"))
      return
    }
    const next: TelegramOperatorData[] = [
      ...tg.operators,
      {
        tgUserId: user.tgUserId,
        tgUsername: user.tgUsername,
        tgDisplayName: user.tgDisplayName,
        memberUserId: null,
        canCreate: true,
        canListAll: true,
        canCancel: true,
        teamAccess: null,
      },
    ]
    try {
      await saveOperators(next, t("discoveryAdded"))
      setSeen((prev) => prev.filter((u) => u.tgUserId !== user.tgUserId))
    } catch (err) {
      toast.error(t("saveError"), {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const remainingMs = discoveryUntil
    ? Math.max(0, new Date(discoveryUntil).getTime() - now)
    : 0
  const remainingText = `${Math.floor(remainingMs / 60_000)}:${String(
    Math.floor((remainingMs % 60_000) / 1_000),
  ).padStart(2, "0")}`

  const editingOp = tg.operators.find((o) => o.tgUserId === editingOperator) ?? null

  return (
    <>
      {/* --- Bot grubu ------------------------------------------------------ */}
      <SettingsGroup
        title={t("title")}
        footer={
          <>
            {t("description")}{" "}
            <span className="text-foreground/70">
              {t("lastPolledLabel")}{" "}
              {tg.lastPolledAt
                ? new Date(tg.lastPolledAt).toLocaleString(locale)
                : t("lastPolledNever")}
            </span>
          </>
        }
      >
        <ToggleRow
          label={t("enabledLabel")}
          hint={t("enabledHint")}
          checked={tg.enabled}
          disabled={disabled}
          onChange={(value) => void toggleEnabled(value)}
        />
        <SettingsRow
          label={t("tokenLabel")}
          value={
            tg.botTokenLast4 ? (
              <span className="font-mono">••••{tg.botTokenLast4}</span>
            ) : (
              tc("notSet")
            )
          }
          onClick={() => {
            setTokenInput("")
            setDialog("token")
          }}
          disabled={disabled}
        />
        <SettingsRow
          label={t("languageLabel")}
          value={languageLabels[tg.language]}
          onClick={() => {
            setLanguage(tg.language)
            setDialog("language")
          }}
          disabled={disabled}
        />
        {/* Dinleme modu — satır içi aksiyon + satır-altı canlı seen listesi */}
        <SettingsRow
          label={t("discoveryTitle")}
          hint={t("discoveryHint")}
          trailing={
            discoveryActive ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">
                  {t("discoveryActive", { time: remainingText })}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={discoveryBusy || disabled}
                  onClick={() => void toggleDiscovery(false)}
                >
                  {t("discoveryStop")}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={discoveryBusy || disabled || !tg.enabled}
                onClick={() => void toggleDiscovery(true)}
              >
                {t("discoveryStart")}
              </Button>
            )
          }
        />
        {discoveryActive ? (
          seen.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {t("discoverySeenEmpty")}
            </div>
          ) : (
            seen.map((user) => (
              <SettingsRow
                key={user.tgUserId}
                label={
                  user.tgDisplayName ||
                  (user.tgUsername ? `@${user.tgUsername}` : user.tgUserId)
                }
                hint={
                  <span className="font-mono">
                    {user.tgUserId}
                    {user.tgUsername ? ` · @${user.tgUsername}` : ""}
                  </span>
                }
                trailing={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void addFromSeen(user)}
                  >
                    {t("discoveryAdd")}
                  </Button>
                }
              />
            ))
          )
        ) : null}
      </SettingsGroup>

      {/* --- Operatörler grubu ---------------------------------------------- */}
      <SettingsGroup title={t("operatorsLabel")} footer={t("operatorsHint")}>
        {tg.operators.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            {t("operatorsEmpty")}
          </div>
        ) : (
          tg.operators.map((op) => (
            <SettingsRow
              key={op.tgUserId}
              leading={<OperatorAvatar op={op} />}
              label={operatorLabel(op)}
              hint={operatorSummary(op)}
              onClick={() => setEditingOperator(op.tgUserId)}
              disabled={disabled}
            />
          ))
        )}
        <SettingsRow
          label={<span className="text-primary">{t("operatorAdd")}</span>}
          onClick={() => {
            setNewOperatorId("")
            setDialog("addOperator")
          }}
          disabled={disabled}
        />
      </SettingsGroup>

      {/* Bot token dialog'u — write-only */}
      <EditDialog
        open={dialog === "token"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("tokenLabel")}
        description={t("tokenHint")}
        saving={saving}
        saveLabel={t("saveVerify")}
        saveDisabled={!tokenInput.trim()}
        onSave={() =>
          run(() =>
            save(
              { telegram: { botToken: tokenInput.trim() } },
              {
                telegram: { ...tg, botTokenLast4: tokenInput.trim().slice(-4) },
              },
              t("saved"),
            ),
          )
        }
      >
        {tg.botTokenLast4 ? (
          <div className="text-sm text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              ••••{tg.botTokenLast4}
            </Badge>
          </div>
        ) : null}
        <Input
          type="password"
          autoComplete="off"
          placeholder={t("tokenPlaceholder")}
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
        />
      </EditDialog>

      {/* Dil dialog'u — manuel label render */}
      <EditDialog
        open={dialog === "language"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("languageLabel")}
        description={t("languageHint")}
        saving={saving}
        onSave={() =>
          run(() =>
            save(
              { telegram: { language } },
              { telegram: { ...tg, language } },
              t("saved"),
            ),
          )
        }
      >
        <Select
          value={language}
          onValueChange={(value) => {
            if (value === "en" || value === "tr") setLanguage(value)
          }}
        >
          <SelectTrigger>
            <span>{languageLabels[language]}</span>
          </SelectTrigger>
          <SelectContent>
            {(["en", "tr"] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {languageLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </EditDialog>

      {/* Elle operatör ekleme dialog'u */}
      <EditDialog
        open={dialog === "addOperator"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("operatorAdd")}
        description={t("operatorAddHint")}
        saving={saving}
        saveDisabled={!newOperatorId.trim()}
        onSave={() =>
          run(async () => {
            const id = newOperatorId.trim()
            if (!/^\d{3,}$/.test(id)) {
              throw new Error(t("operatorsInvalid"))
            }
            if (tg.operators.some((o) => o.tgUserId === id)) {
              throw new Error(t("operatorDuplicate"))
            }
            await saveOperators(
              [
                ...tg.operators,
                {
                  tgUserId: id,
                  tgUsername: null,
                  tgDisplayName: null,
                  memberUserId: null,
                  canCreate: true,
                  canListAll: true,
                  canCancel: true,
                  // UI'dan yeni eklenen operatör takım erişimi olmadan başlar.
                  teamAccess: null,
                },
              ],
              t("saved"),
            )
          })
        }
      >
        <Input
          value={newOperatorId}
          placeholder={t("operatorAddPlaceholder")}
          onChange={(e) => setNewOperatorId(e.target.value)}
        />
      </EditDialog>

      {/* Operatör düzenleme dialog'u */}
      {editingOp ? (
        <OperatorDialog
          key={editingOp.tgUserId}
          operator={editingOp}
          operators={tg.operators}
          teams={teams}
          members={members}
          saveOperators={saveOperators}
          onClose={() => setEditingOperator(null)}
        />
      ) : null}
    </>
  )
}

/* ----------------------------- Operatör dialog'u --------------------------- */

function OperatorDialog({
  operator,
  operators,
  teams,
  members,
  saveOperators,
  onClose,
}: {
  operator: TelegramOperatorData
  operators: TelegramOperatorData[]
  teams: TeamOption[]
  members: MemberOption[]
  saveOperators: (
    next: TelegramOperatorData[],
    successText: string,
  ) => Promise<void>
  onClose: () => void
}) {
  const t = useTranslations("linearLite.settings.telegram")
  const tc = useTranslations("linearLite.settings.common")

  const [draft, setDraft] = React.useState<TelegramOperatorData>(operator)
  const [saving, setSaving] = React.useState(false)
  // Destructive kaldırma iki adımlı: ilk tık onay ister.
  const [confirmingRemove, setConfirmingRemove] = React.useState(false)

  const member = members.find((m) => m.userId === draft.memberUserId) ?? null
  const accessTeam =
    draft.teamAccess && draft.teamAccess !== "all"
      ? (teams.find((tm) => tm.id === draft.teamAccess) ?? null)
      : null

  function patch(p: Partial<TelegramOperatorData>) {
    setDraft((prev) => ({ ...prev, ...p }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveOperators(
        operators.map((o) => (o.tgUserId === operator.tgUserId ? draft : o)),
        t("saved"),
      )
      onClose()
    } catch (err) {
      toast.error(t("saveError"), {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!confirmingRemove) {
      setConfirmingRemove(true)
      return
    }
    setSaving(true)
    try {
      await saveOperators(
        operators.filter((o) => o.tgUserId !== operator.tgUserId),
        t("saved"),
      )
      onClose()
    } catch (err) {
      toast.error(t("saveError"), {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{operatorLabel(operator)}</DialogTitle>
          <DialogDescription className="font-mono">
            {operator.tgUserId}
            {operator.tgUsername ? ` · @${operator.tgUsername}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Komut yetkileri */}
          <div className="divide-y rounded-lg border">
            {(
              [
                ["canCreate", t("permCreate")],
                ["canListAll", t("permListAll")],
                ["canCancel", t("permCancel")],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <span className="text-sm">{label}</span>
                <Switch
                  checked={draft[key]}
                  onCheckedChange={(value) => patch({ [key]: value })}
                />
              </div>
            ))}
          </div>

          {/* Takım erişimi — manuel label render, SelectValue YOK */}
          <div className="space-y-2">
            <Label>{t("teamAccessLabel")}</Label>
            <Select
              value={
                draft.teamAccess === "all" ? "all" : (draft.teamAccess ?? "none")
              }
              onValueChange={(value) =>
                patch({
                  teamAccess:
                    value === "all" ? "all" : value === "none" ? null : value,
                })
              }
            >
              <SelectTrigger>
                {draft.teamAccess === "all" ? (
                  <span>{t("teamAccessAll")}</span>
                ) : accessTeam ? (
                  <span>
                    {accessTeam.name}{" "}
                    <span className="text-muted-foreground">
                      ({accessTeam.key})
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t("teamAccessNone")}
                  </span>
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("teamAccessNone")}</SelectItem>
                <SelectItem value="all">{t("teamAccessAll")}</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name} ({team.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("teamAccessHint")}</p>
          </div>

          {/* Şirket kullanıcısı eşleme — opsiyonel */}
          <div className="space-y-2">
            <Label>{t("memberLabel")}</Label>
            <Select
              value={draft.memberUserId ?? "none"}
              onValueChange={(value) =>
                patch({ memberUserId: !value || value === "none" ? null : value })
              }
            >
              <SelectTrigger>
                {member ? (
                  <span className="truncate">{member.name || member.email}</span>
                ) : (
                  <span className="text-muted-foreground">{t("memberNone")}</span>
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("memberNone")}</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name ? `${m.name} (${m.email})` : m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("memberHint")}</p>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="destructive"
            onClick={() => void handleRemove()}
            disabled={saving}
          >
            {confirmingRemove ? t("operatorRemoveConfirm") : t("operatorRemove")}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? tc("saving") : tc("save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
