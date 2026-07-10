"use client"

// Triage app/components/tasks/task-comments.tsx portu (PLAN §6).
import { motion } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import type { IssueComment } from "@/lib/linear/types"

type Props = {
  comments: IssueComment[]
}

function initials(name?: string | null): string {
  if (!name) return "?"
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("")
}

function formatDate(value: string, locale: string): string {
  try {
    return new Date(value).toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return value
  }
}

export function TaskComments({ comments }: Props) {
  const reduce = useReducedMotion()
  const t = useTranslations("linearLite")
  const locale = useLocale()
  if (comments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("tasks.comments.none")}
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {comments.map((c, i) => (
        <motion.li
          key={c.id}
          initial={
            reduce ? false : { opacity: 0, y: 4 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduce ? 0 : 0.18,
            delay: reduce ? 0 : Math.min(i * 0.03, 0.18),
          }}
          className="flex gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5"
        >
          <Avatar className="size-7">
            {c.user?.avatarUrl ? (
              <AvatarImage src={c.user.avatarUrl} alt={c.user.name ?? ""} />
            ) : null}
            <AvatarFallback className="text-[10px]">
              {initials(c.user?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-foreground">
                {c.user?.name ?? t("tasks.comments.unknown")}
              </span>
              <span className="text-muted-foreground">
                {formatDate(c.createdAt, locale)}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap text-foreground/90">
              {c.body}
            </p>
          </div>
        </motion.li>
      ))}
    </ul>
  )
}
