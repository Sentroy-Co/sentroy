"use client"

import { useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Edit02Icon, Loading03Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

/**
 * EditableField — Facebook profil tarzı inline preview + hover'da kalem
 * ikonu + dialog ile düzenleme.
 *
 * Tasarım:
 *  - `display` prop'u inline preview için verilir (string veya ReactNode);
 *    custom render istersen ReactNode geç (örn slug için mono font).
 *  - Hover olunca kalem (Edit02) ikonu sağda görünür. `editable=false`
 *    durumunda kalem hiç görünmez ve container hover state'i değişmez —
 *    role-bazlı readonly senaryoları için.
 *  - Tıklanınca Dialog açılır, içinde tek input + iki buton (Cancel /
 *    Save). Save async — `onSave` Promise döner, loading state otomatik.
 *  - `validate` opsiyonel — yerel validasyon, error string dönerse Save
 *    disabled + error metni gösterilir.
 *  - `transform` opsiyonel — kullanıcı yazarken değeri filtrele (örn
 *    slug'da küçük harf + tire normalize).
 *  - `dialogChildren` ile slot — checkbox, multiline, custom widget'lar
 *    için input yerine kendi alanını koy.
 */

export interface EditableFieldProps {
  /** Header etiketi (small, uppercase) — tüm alanlar tutarlı bir mini-label gösterir. */
  label: string
  /** Inline preview — string veya custom node. Boşsa `placeholder` gösterilir. */
  display: ReactNode
  /** Mevcut değer — dialog inputu bu ile başlar. */
  value: string
  /**
   * Save callback — Promise reject ederse dialog açık kalır, hata toast'ı
   * çağıran tarafın sorumluluğu. Resolve ederse dialog otomatik kapanır.
   */
  onSave: (next: string) => Promise<void>
  /** Dialog başlığı — default `Edit {label}`. */
  dialogTitle?: string
  /** Dialog açıklama metni. */
  dialogDescription?: string
  /** Input placeholder. */
  placeholder?: string
  /** Read-only — true iken pencil hiç görünmez. */
  editable?: boolean
  /** Yazarken değeri normalize et — örn lowercase + tire. */
  transform?: (raw: string) => string
  /** Validasyon — error string veya null. */
  validate?: (next: string) => string | null
  /**
   * Tek-satır input yerine textarea — multiline metinler için. Boyut
   * `rows` ile kontrol edilir.
   */
  multiline?: boolean
  rows?: number
  /**
   * Custom dialog inner content — `value` state'i parent (EditableField)
   * yönettiğinden buraya `value` + `onChange` geçer. Boş bırakılırsa
   * default `<Input>` veya `<textarea>` render edilir.
   */
  renderInput?: (
    state: {
      value: string
      onChange: (v: string) => void
      disabled: boolean
    },
  ) => ReactNode
  /** Container ek class — tema/spacing override. */
  className?: string
  /** Display container ek class — büyük başlık style'i için. */
  displayClassName?: string
}

export function EditableField({
  label,
  display,
  value,
  onSave,
  dialogTitle,
  dialogDescription,
  placeholder,
  editable = true,
  transform,
  validate,
  multiline = false,
  rows = 4,
  renderInput,
  className,
  displayClassName,
}: EditableFieldProps) {
  const tCommon = useTranslations("common")
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  const errorText = validate ? validate(draft) : null
  const dirty = draft !== value

  const openDialog = () => {
    if (!editable) return
    setDraft(value)
    setOpen(true)
  }

  const handleChange = (raw: string) => {
    setDraft(transform ? transform(raw) : raw)
  }

  const handleSave = async () => {
    if (!dirty || errorText) return
    setSaving(true)
    try {
      await onSave(draft)
      setOpen(false)
    } catch {
      // Caller toast'lıyor; dialog açık kalsın ki user retry yapabilsin.
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={!editable}
        className={cn(
          "group/editable relative flex w-full flex-col gap-1 rounded-lg border border-transparent p-2 text-start transition-colors",
          editable
            ? "hover:border-border hover:bg-muted/30 focus-visible:border-border focus-visible:bg-muted/30"
            : "cursor-default",
          className,
        )}
      >
        <Label className="pointer-events-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>
        <div
          className={cn(
            "min-h-[1.5rem] text-sm",
            !display && "text-muted-foreground/60 italic",
            displayClassName,
          )}
        >
          {display || placeholder || tCommon("notSet")}
        </div>
        {editable && (
          <span
            aria-hidden
            className="pointer-events-none absolute end-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity group-hover/editable:opacity-100 group-focus-visible/editable:opacity-100"
          >
            <HugeiconsIcon
              icon={Edit02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogTitle ?? `${tCommon("edit")} ${label.toLowerCase()}`}
            </DialogTitle>
            {dialogDescription && (
              <DialogDescription>{dialogDescription}</DialogDescription>
            )}
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {renderInput ? (
              renderInput({
                value: draft,
                onChange: handleChange,
                disabled: saving,
              })
            ) : multiline ? (
              <textarea
                value={draft}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={placeholder}
                disabled={saving}
                rows={rows}
                className="rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <Input
                value={draft}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={placeholder}
                disabled={saving}
                autoFocus
              />
            )}
            {errorText && (
              <p className="text-xs text-destructive">{errorText}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !dirty || !!errorText}
            >
              {saving && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
