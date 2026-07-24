"use client"

import { useState } from "react"
import {
  FilePreviewLightbox,
  type FilePreviewItem,
} from "@workspace/ui/components/file-preview-lightbox"

/**
 * Public shared-file viewer — FilePreviewLightbox'ı tek dosya için tam ekran
 * gösterir (image/video/audio/pdf/text). Ham byte yerine zengin görüntüleme.
 * Kapat (X) → Sentroy Storage ana sayfası (paylaşılan linkte "geri" yok).
 * İndirme public `/f/<id>?download=1` üzerinden (credential'sız).
 */
export function PublicViewer({
  item,
  downloadUrl,
  homeUrl,
}: {
  item: FilePreviewItem
  downloadUrl: string
  homeUrl: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <FilePreviewLightbox
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o && typeof window !== "undefined") window.location.href = homeUrl
      }}
      items={[item]}
      onDownload={() => {
        if (typeof window === "undefined") return
        const a = document.createElement("a")
        a.href = downloadUrl
        a.rel = "noopener"
        a.click()
      }}
    />
  )
}
