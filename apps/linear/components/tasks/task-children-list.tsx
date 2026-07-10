"use client"

// Triage app/components/tasks/task-children-list.tsx portu (PLAN §6).
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"

import { Link } from "@/lib/router-compat"
import { TaskPriorityIcon } from "./task-priority-icon"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import type { IssueChildRef } from "@/lib/linear/types"

type Props = {
  children: IssueChildRef[]
}

export function TaskChildrenList({ children }: Props) {
  const reduce = useReducedMotion()
  const t = useTranslations("linearLite")
  if (children.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-[10px] font-medium tracking-[0.16em] text-muted-foreground/70 uppercase">
        {t("tasks.children.heading", { count: children.length })}
      </h3>
      <ol className="flex flex-col gap-1">
        {children.map((c, i) => (
          <motion.li
            key={c.id}
            initial={reduce ? false : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? 0 : 0.16,
              delay: reduce ? 0 : Math.min(i * 0.02, 0.2),
            }}
          >
            <Link
              to={`/tasks/${c.id}`}
              className="group flex items-center gap-2.5 rounded-md border border-border/50 bg-card/40 px-2.5 py-1.5 text-xs transition-colors hover:border-border hover:bg-accent/40"
            >
              <TaskPriorityIcon priority={c.priority} />
              <span className="font-mono text-[10px] tracking-tight text-muted-foreground">
                {c.identifier}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {c.title}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                title={c.state.name}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: c.state.color }}
                  aria-hidden
                />
                {c.state.name}
              </span>
            </Link>
          </motion.li>
        ))}
      </ol>
    </section>
  )
}
