"use client"

import { useTranslations } from "next-intl"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { useConfirmStore } from "@workspace/console/stores/confirm"

/**
 * Layout'ta global olarak render edilen confirm dialog.
 * `useConfirmStore.getState().confirm({ ... })` ile tetiklenir ve kullanıcı
 * cevabını promise olarak döndürür.
 */
export function ConfirmDialog() {
  const t = useTranslations("common")
  const { isOpen, options, handleConfirm, handleCancel, handleTertiary } =
    useConfirmStore()

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancel()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description && (
            <DialogDescription>{options.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {options?.cancelText ?? t("cancel")}
          </Button>
          {options?.tertiaryText ? (
            <Button
              variant={
                options.tertiaryDestructive ? "destructive" : "ghost"
              }
              onClick={handleTertiary}
            >
              {options.tertiaryText}
            </Button>
          ) : null}
          <Button
            variant={options?.destructive ? "destructive" : "default"}
            onClick={handleConfirm}
          >
            {options?.confirmText ?? t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
