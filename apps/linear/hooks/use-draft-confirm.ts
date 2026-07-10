"use client"

import { useCallback } from "react"
import { useTranslations } from "next-intl"
import { useTasksStore } from "@/stores/tasks-store"
import { useChoice } from "@/components/common/confirm-dialog"

/**
 * "Sil / Sakla / Vazgeç" taslak onayı — dialog-mode sadeleştirmesi (PLAN §5).
 *
 * Triage'da route-blocking (useBlocker) da vardı; Next App Router'da
 * client-side navigation'ı bloklayan bir API olmadığından yalnız dialog
 * kapanışında sorulur (`confirmClose`). `routeMode` parametresi caller
 * uyumluluğu için kabul edilir ama etkisizdir.
 *
 *   Sakla   → draft remains in zustand (sessionStorage); proceed
 *   Sil     → clearDraft(); proceed
 *   Vazgeç  → dialog açık kalır; onClose çağrılmaz
 *
 * Draft kontrolü zustand.getState() ile anlık okunur — ref/closure'a
 * güvenmek başarılı submit sırasında stale değer görüyordu (clearDraft()
 * çağrılıp hemen kapatıldığında React ref'i güncellemeden önce kontrol
 * tetikleniyordu).
 */

function readHasDraft(): boolean {
  const d = useTasksStore.getState().draftForm
  return Boolean(
    d.title.trim() ||
      d.description.trim() ||
      d.assigneeId ||
      d.labelIds.length > 0,
  )
}

export function useDraftConfirm({
  // routeMode triage uyumluluğu için kabul edilir; Next'te route-blocking
  // yok, bu yüzden etkisiz (dialog-mode-only).
  routeMode: _routeMode = false,
}: { routeMode?: boolean } = {}) {
  const t = useTranslations("linearLite.draft")
  // Subscribe to draft for re-render trigger on hasDraft change; actual
  // decision reads anlık state (readHasDraft).
  const draft = useTasksStore((s) => s.draftForm)
  const clearDraft = useTasksStore((s) => s.clearDraft)
  const choice = useChoice()

  const hasDraft = Boolean(
    draft.title.trim() ||
      draft.description.trim() ||
      draft.assigneeId ||
      draft.labelIds.length > 0,
  )

  const confirmClose = useCallback(
    async (onClose: () => void) => {
      if (!readHasDraft()) {
        onClose()
        return
      }
      const result = await choice({
        title: t("title"),
        description: t("description"),
        options: [
          { label: t("discard"), value: "discard", variant: "destructive" },
          { label: t("cancel"), value: "cancel" },
          { label: t("keep"), value: "keep" },
        ],
        cancelValue: "cancel",
      })
      if (result === "discard") {
        clearDraft()
        onClose()
      } else if (result === "keep") {
        onClose()
      }
    },
    [choice, clearDraft, t],
  )

  return { confirmClose, hasDraft }
}
