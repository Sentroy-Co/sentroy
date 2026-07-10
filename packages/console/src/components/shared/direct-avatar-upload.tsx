"use client"

import { useCallback, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"

/**
 * Avatar/logo upload — bucket seçme veya MediaManager dialog'u olmadan,
 * single-purpose akış:
 *
 *   1. trigger click → native file picker
 *   2. resim seçilince CropDialog (SDK) açılır, aspect lock'lu
 *   3. Apply → multipart POST `uploadUrl`
 *   4. onUploaded(response) — caller state'ini günceller
 *
 * Settings (company avatar) ve profile (user avatar) sayfalarında
 * paylaşılan davranış: kullanıcı bucket düşünmeden tek tıkla yükler.
 *
 * `uploadUrl` POST multipart accept edip JSON döndürmeli — backend
 * sözleşmesi caller'a bağlı; response objesi onUploaded'a ham geçer.
 */

// Client-only — react-mobile-cropper SSR'da window kullanır.
const CropDialog = dynamic(
  () =>
    import("@sentroy-co/client-sdk/react/crop").then((m) => m.CropDialog),
  { ssr: false },
)

export interface DirectAvatarUploadProps {
  /** POST endpoint — multipart/form-data, field name "file". */
  uploadUrl: string
  /** CropDialog default aspect — "1:1" (kare avatar default'u). */
  defaultAspect?: string
  /** MIME filter — sadece resim formatları. Default "image/*". */
  accept?: string
  /** Trigger element. `onClick` prop'u inject ederiz. */
  children: (props: { onClick: () => void; disabled: boolean }) => React.ReactNode
  /** Upload başarılı olunca server response'u — caller state'ini günceller. */
  onUploaded: (response: unknown) => void
  /** Hata mesajı için i18n-aware kullanım: caller toast yerine custom log
   *  isterse override edebilir. Default: sonner toast.error. */
  onError?: (message: string) => void
  /** True iken trigger disabled, file picker tetiklenmez. */
  disabled?: boolean
}

export function DirectAvatarUpload({
  uploadUrl,
  defaultAspect = "1:1",
  accept = "image/*",
  children,
  onUploaded,
  onError,
  disabled = false,
}: DirectAvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const openPicker = useCallback(() => {
    if (disabled || busy) return
    inputRef.current?.click()
  }, [disabled, busy])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      e.target.value = "" // aynı dosyayı yeniden seçebilmek için reset
      if (!f) return
      if (!f.type.startsWith("image/")) {
        ;(onError ?? toast.error)("Only image files are accepted")
        return
      }
      setPickedFile(f)
    },
    [onError],
  )

  const handleClose = useCallback(
    async (out: File | null) => {
      const original = pickedFile
      setPickedFile(null)
      if (!out || !original) return
      // CropDialog `out === original` ise "Use original" basıldı, `out`
      // farklı File instance ise crop edildi. Her iki halde de multipart
      // POST.
      setBusy(true)
      try {
        const form = new FormData()
        form.append("file", out, out.name)
        const res = await fetch(uploadUrl, { method: "POST", body: form })
        const json = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        if (!res.ok) {
          const msg =
            typeof json.error === "string" ? json.error : "Upload failed"
          throw new Error(msg)
        }
        onUploaded(json)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed"
        ;(onError ?? toast.error)(msg)
      } finally {
        setBusy(false)
      }
    },
    [pickedFile, uploadUrl, onUploaded, onError],
  )

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
      {children({ onClick: openPicker, disabled: disabled || busy })}
      {pickedFile && (
        <CropDialog
          open
          file={pickedFile}
          defaultAspect={defaultAspect}
          onClose={handleClose}
        />
      )}
    </>
  )
}
