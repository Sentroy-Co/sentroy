"use client"

import { motion } from "framer-motion"
import { Skeleton } from "@workspace/ui/components/skeleton"

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
}

const item = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
}

function CardVariant() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <motion.div key={i} variants={item}>
          <Skeleton className="h-32 w-full rounded-2xl" />
        </motion.div>
      ))}
    </motion.div>
  )
}

function TableVariant() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-2"
    >
      <motion.div variants={item}>
        <Skeleton className="h-10 w-full rounded-2xl" />
      </motion.div>
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div key={i} variants={item}>
          <Skeleton className="h-12 w-full rounded-2xl" />
        </motion.div>
      ))}
    </motion.div>
  )
}

function ListVariant() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-3"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div key={i} variants={item} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/3 rounded-2xl" />
            <Skeleton className="h-3 w-2/3 rounded-2xl" />
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}

export function SectionLoading({
  variant = "card",
}: {
  variant?: "card" | "table" | "list"
}) {
  switch (variant) {
    case "table":
      return <TableVariant />
    case "list":
      return <ListVariant />
    default:
      return <CardVariant />
  }
}
