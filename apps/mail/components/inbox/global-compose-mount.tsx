"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ComposeSheet } from "@/components/inbox/compose-sheet"

/**
 * Mail-app dashboard layout'una mount edilir; FloatingComposeButton'un
 * inbox dışındaki sayfalardan dispatch ettiği `sentroy:compose-open-global`
 * event'ini dinler ve ComposeSheet'i o sayfada açar. Inbox sayfasında
 * inbox-content kendi composer'ını yönetir (reply/forward defaults
 * dahil) ve farklı bir event (`sentroy:compose-open`) dinler — bu mount
 * o event'e karışmaz.
 */
export function GlobalComposeMount() {
  const params = useParams<{ "company-slug": string }>()
  const slug = params?.["company-slug"] ?? ""
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handler() {
      setOpen(true)
    }
    window.addEventListener("sentroy:compose-open-global", handler)
    return () =>
      window.removeEventListener("sentroy:compose-open-global", handler)
  }, [])

  if (!slug) return null

  return <ComposeSheet slug={slug} open={open} onOpenChange={setOpen} />
}
