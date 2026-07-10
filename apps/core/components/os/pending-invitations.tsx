"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Building03Icon,
  Loading03Icon,
  Mail01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"

interface PendingInvite {
  token: string
  role: "owner" | "admin" | "member"
  expiresAt: string
  company: { name: string; slug: string; avatarUrl: string | null }
}

/**
 * First-run ekranında kullanıcının e-postasına gelen bekleyen davetleri
 * listeler. Davet yoksa (veya yüklenirken) hiçbir şey render etmez — böylece
 * "workspace oluştur" hero'su birincil kalır. Kabul edilince onAccepted(slug)
 * ile ilgili şirkete geçilir.
 */
export function PendingInvitations({
  onAccepted,
}: {
  onAccepted: (slug: string) => void
}) {
  const t = useTranslations("os")
  const [invites, setInvites] = useState<PendingInvite[] | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/invitations/pending")
        const json = await res.json()
        if (cancelled) return
        setInvites(res.ok ? ((json.data as PendingInvite[]) ?? []) : [])
      } catch {
        if (!cancelled) setInvites([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function accept(inv: PendingInvite) {
    if (accepting) return
    setAccepting(inv.token)
    try {
      const res = await fetch(`/api/invitations/${inv.token}/accept`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("pendingInvites.acceptError"))
      const slug = (json.data?.companySlug as string) || inv.company.slug
      toast.success(t("pendingInvites.accepted", { company: inv.company.name }))
      onAccepted(slug)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("pendingInvites.acceptError"),
      )
      setAccepting(null)
    }
  }

  if (!invites || invites.length === 0) return null

  const ROLE_LABELS: Record<string, string> = {
    owner: t("pendingInvites.roleOwner"),
    admin: t("pendingInvites.roleAdmin"),
    member: t("pendingInvites.roleMember"),
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="w-full max-w-md rounded-3xl border border-white/20 bg-white/15 p-6 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-black/25"
    >
      <div className="mb-4 flex items-center gap-2">
        <HugeiconsIcon
          icon={Mail01Icon}
          className="size-4 text-primary"
          strokeWidth={2}
        />
        <h2 className="text-sm font-semibold text-foreground">
          {t("pendingInvites.title")}
        </h2>
      </div>
      <div className="flex flex-col gap-2">
        {invites.map((inv) => (
          <div
            key={inv.token}
            className="flex items-center gap-3 rounded-2xl border border-white/15 bg-background/50 p-3"
          >
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
              {inv.company.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={inv.company.avatarUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <HugeiconsIcon
                  icon={Building03Icon}
                  className="size-5 text-muted-foreground/60"
                  strokeWidth={1.6}
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {inv.company.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t("pendingInvites.asRole", {
                  role: ROLE_LABELS[inv.role] ?? inv.role,
                })}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => accept(inv)}
              disabled={accepting !== null}
              className="shrink-0 rounded-lg"
            >
              {accepting === inv.token ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  className="size-4 animate-spin"
                  strokeWidth={2}
                  data-icon="inline-start"
                />
              ) : null}
              {t("pendingInvites.accept")}
            </Button>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
