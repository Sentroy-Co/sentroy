"use client"

import { useCallback } from "react"
import { FileCodeEditor } from "@workspace/ui/components/file-code-editor"

/**
 * Authed, chromeless dosya editörü embed'i — mobil WebView (session cookie'siyle)
 * ve first-party iframe'ler bunu yükler. Paylaşılan [FileCodeEditor]'ı render
 * eder; içerik private download route'undan (cookie ile) gelir, kaydetme mevcut
 * `PUT .../content` endpoint'ine gider. `fixed inset-0` ile tam ekran (dashboard
 * shell'i `?embed` → `[data-embedded]` zaten gizler).
 */
export function EditEmbedClient({
  companySlug,
  bucketSlug,
  mediaId,
  fileName,
  mimeType,
}: {
  companySlug: string
  bucketSlug: string
  mediaId: string
  fileName: string
  mimeType?: string
}) {
  const base = `/api/companies/${companySlug}/buckets/${bucketSlug}/media/${mediaId}`

  const onSave = useCallback(
    async (content: string) => {
      const res = await fetch(`${base}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `Save failed (${res.status})`)
      }
    },
    [base],
  )

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <FileCodeEditor
        url={`${base}/download`}
        fileName={fileName}
        mimeType={mimeType}
        onSave={onSave}
      />
    </div>
  )
}
