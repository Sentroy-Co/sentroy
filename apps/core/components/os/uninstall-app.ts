import { confirm } from "@workspace/console/stores/confirm"
import { toast } from "sonner"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"

/** Dış (App Store) uygulaması mı — embed.appId taşıyan store app'i. */
export function isStoreApp(app: AppDescriptor): app is AppDescriptor & { embed: NonNullable<AppDescriptor["embed"]> } {
  return app.kind === "store" && Boolean(app.embed?.appId)
}

/**
 * Kurulu store app'ini kaldırır: styled confirm → DELETE → toast. Başarılıysa
 * `sentroy:apps-changed` dispatch eder (SentroyOS storeApps'i + Launchpad'i
 * tazeler). Etiketler i18n'den çözülmüş gelir (caller `t(...)` ile geçer) —
 * helper next-intl'e bağlı kalmaz. Geri dönen değer: kaldırıldı mı.
 */
export async function uninstallStoreApp(
  app: AppDescriptor,
  labels: { title: string; description: string; confirmText: string; success: string; failed: string },
): Promise<boolean> {
  const appId = app.embed?.appId
  const companySlug = app.embed?.companySlug
  if (!appId || !companySlug) return false
  const ok = await confirm({
    title: labels.title,
    description: labels.description,
    confirmText: labels.confirmText,
    destructive: true,
  })
  if (!ok) return false
  try {
    const res = await fetch(
      `/api/app-store/${appId}/install?company=${encodeURIComponent(companySlug)}`,
      { method: "DELETE" },
    )
    if (!res.ok) {
      toast.error(labels.failed)
      return false
    }
    toast.success(labels.success)
    window.dispatchEvent(new Event("sentroy:apps-changed"))
    return true
  } catch {
    toast.error(labels.failed)
    return false
  }
}
