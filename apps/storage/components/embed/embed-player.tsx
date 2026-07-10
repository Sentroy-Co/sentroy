"use client"

import { useState } from "react"
import { FilePreviewLightbox, type FilePreviewItem } from "@workspace/ui/components/file-preview-lightbox"

/**
 * Wraps the existing FilePreviewLightbox in `inline` mode so the
 * embed page renders the same audio/video player the dashboard
 * uses — no chrome, no thumbnail strip, no nav arrows. The lightbox
 * already supports an inline single-item layout; we lock `open` to
 * `true` so the player is mounted from first paint, and drop the
 * convert/download props since the embed surface doesn't need them.
 */
export function EmbedPlayer({
  item,
  kind: _kind,
}: {
  item: FilePreviewItem
  kind: "audio" | "video"
}) {
  // The lightbox API requires `open` + `onOpenChange`; we ignore
  // attempts to close because there's no underlying surface to fall
  // back to — closing would just leave a black iframe.
  const [open, setOpen] = useState(true)
  void _kind
  return (
    <div className="flex h-full w-full">
      <FilePreviewLightbox
        open={open}
        onOpenChange={(o) => {
          // Reopen immediately if the user hits Escape — the embed
          // is the page, there's nothing else to navigate to.
          if (!o) setOpen(true)
        }}
        items={[item]}
        embed
      />
    </div>
  )
}
