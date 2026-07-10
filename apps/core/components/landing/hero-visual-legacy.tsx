import { AnalyticsUpIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "framer-motion";

export default function HeroVisual() {
    return (
      <div className="relative hidden aspect-[4/3] w-full lg:block">
        {/* Glow */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/20 via-transparent to-transparent blur-3xl" />
  
        {/* Main card — email preview */}
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-[12%] overflow-hidden rounded-2xl border bg-background shadow-2xl"
        >
          <div className="flex items-center gap-1.5 border-b bg-muted/30 px-4 py-2.5">
            <div className="size-2.5 rounded-full bg-red-400/70" />
            <div className="size-2.5 rounded-full bg-amber-400/70" />
            <div className="size-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-auto text-[10px] text-muted-foreground">inbox</span>
          </div>
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                S
              </div>
              <div className="flex-1">
                <div className="h-2 w-24 rounded bg-foreground/70" />
                <div className="mt-1.5 h-1.5 w-32 rounded bg-muted-foreground/40" />
              </div>
              <div className="text-[10px] text-muted-foreground">now</div>
            </div>
            <div className="h-2.5 w-3/4 rounded bg-foreground/80" />
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="h-1.5 rounded bg-muted-foreground/30" />
              <div className="h-1.5 w-5/6 rounded bg-muted-foreground/30" />
              <div className="h-1.5 w-4/6 rounded bg-muted-foreground/30" />
            </div>
            <div className="mt-2 h-7 w-24 rounded-lg bg-primary" />
          </div>
        </motion.div>
  
        {/* Floating delivery badge */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          className="absolute right-0 top-[8%] flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 shadow-lg"
        >
          <span className="flex size-2 rounded-full bg-emerald-500">
            <span className="absolute size-2 animate-ping rounded-full bg-emerald-500/60" />
          </span>
          <span className="text-xs font-medium">Delivered in 0.4s</span>
        </motion.div>
  
        {/* Floating metric */}
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-[6%] left-0 rounded-xl border bg-background p-3 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={AnalyticsUpIcon}
              strokeWidth={2}
              className="size-4 text-primary"
            />
            <span className="text-xs font-medium">Open rate</span>
          </div>
          <div className="mt-1 text-lg font-bold">42.8%</div>
        </motion.div>
      </div>
    )
  }