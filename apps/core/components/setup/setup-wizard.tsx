"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DatabaseIcon,
  Loading03Icon,
  Tick02Icon,
  Upload01Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Logo } from "@workspace/console/components/shared"
import { cn } from "@workspace/ui/lib/utils"

type Stage = "choose" | "seed" | "import" | "done"

export function SetupWizard({ lang }: { lang: string }) {
  const t = useTranslations("setup")
  const router = useRouter()
  const [stage, setStage] = useState<Stage>("choose")
  const [adminEmail, setAdminEmail] = useState("admin@sentroy.com")
  const [adminPassword, setAdminPassword] = useState("")
  const [setupToken, setSetupToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<string[]>([])
  const importInputRef = useRef<HTMLInputElement | null>(null)

  // SETUP_TOKEN env set ise sunucu `x-setup-token` bekler (admin-takeover
  // yarışını kapatır). Boşsa header gönderilmez → geriye dönük uyumlu.
  function setupHeaders(base: Record<string, string> = {}): Record<string, string> {
    const tok = setupToken.trim()
    return tok ? { ...base, "x-setup-token": tok } : base
  }

  async function runSeed() {
    if (!adminPassword.trim()) {
      toast.error(t("passwordRequired"))
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/setup/seed", {
        method: "POST",
        headers: setupHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminEmail, adminPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("seedFailed"))
      setSteps(json.data?.steps ?? [])
      setStage("done")
      toast.success(t("seedComplete"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("seedFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function runImport(file: File) {
    setBusy(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/setup/import", {
        method: "POST",
        headers: setupHeaders(),
        body: form,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("importFailed"))
      const data = json.data ?? {}
      setSteps([
        `Source: ${data.sourceDbName ?? "unknown"}`,
        `Collections: ${data.collectionsCopied ?? 0}`,
        `Documents: ${(data.totalDocs ?? 0).toLocaleString()}`,
      ])
      setStage("done")
      toast.success(t("importComplete"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("importFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-3">
        <Logo size="lg" />
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="max-w-md text-sm text-balance text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="w-full max-w-2xl">
        {stage === "choose" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setStage("seed")}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border bg-card p-5 text-start transition-all",
                "hover:border-primary/40 hover:shadow-md",
              )}
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HugeiconsIcon icon={ZapIcon} strokeWidth={2} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{t("seedTitle")}</span>
                <span className="text-xs text-muted-foreground">
                  {t("seedDesc")}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setStage("import")}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border bg-card p-5 text-start transition-all",
                "hover:border-primary/40 hover:shadow-md",
              )}
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{t("importTitle")}</span>
                <span className="text-xs text-muted-foreground">
                  {t("importDesc")}
                </span>
              </div>
            </button>
          </div>
        )}

        {stage === "seed" && (
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ZapIcon} strokeWidth={2} />
              <h2 className="font-semibold">{t("seedTitle")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("seedFormDesc")}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("adminEmail")}</Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("adminPassword")}</Label>
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                disabled={busy}
                placeholder="••••••••"
              />
              <p className="text-[10px] text-muted-foreground">
                {t("adminPasswordHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("setupToken")}</Label>
              <Input
                type="password"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                disabled={busy}
                placeholder="SETUP_TOKEN"
                autoComplete="off"
              />
              <p className="text-[10px] text-muted-foreground">
                {t("setupTokenHint")}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setStage("choose")}
                disabled={busy}
              >
                {t("back")}
              </Button>
              <Button onClick={runSeed} disabled={busy || !adminPassword}>
                {busy && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("runSeed")}
              </Button>
            </div>
          </div>
        )}

        {stage === "import" && (
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
              <h2 className="font-semibold">{t("importTitle")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("importFormDesc")}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("setupToken")}</Label>
              <Input
                type="password"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                disabled={busy}
                placeholder="SETUP_TOKEN"
                autoComplete="off"
              />
              <p className="text-[10px] text-muted-foreground">
                {t("setupTokenHint")}
              </p>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) runImport(f)
                if (importInputRef.current) importInputRef.current.value = ""
              }}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setStage("choose")}
                disabled={busy}
              >
                {t("back")}
              </Button>
              <Button
                onClick={() => importInputRef.current?.click()}
                disabled={busy}
              >
                {busy ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <HugeiconsIcon
                    icon={DatabaseIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                )}
                {t("pickFile")}
              </Button>
            </div>
          </div>
        )}

        {stage === "done" && (
          <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
            </div>
            <h2 className="text-lg font-semibold">{t("doneTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("doneDesc")}</p>
            {steps.length > 0 && (
              <ul className="w-full rounded-lg bg-muted/40 p-3 text-start text-xs font-mono text-muted-foreground">
                {steps.map((s, i) => (
                  <li key={i}>· {s}</li>
                ))}
              </ul>
            )}
            <Button
              onClick={() => router.push(`/${lang}/login`)}
              className="mt-2"
            >
              {t("goLogin")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
