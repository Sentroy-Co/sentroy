"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import Lottie, { type LottieRefCurrentProps } from "lottie-react"
import { motion, AnimatePresence } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { SmileIcon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Button } from "@workspace/ui/components/button"

/**
 * Reaction kit — six Lottie reactions paired with a unicode fallback.
 * The ordering is fixed so users build muscle memory across posts.
 *
 * `lottiePath` is consumed via fetch on the client; missing/empty path
 * falls back to the static `unicode` glyph rendered with the same
 * grayscale-by-default + colored-on-active treatment.
 */
export type ReactionKey =
  | "like"
  | "fire"
  | "lmao"
  | "clap"
  | "cool"
  | "mind_blown"
  | "thinking"
  | "raised_eyebrow"
  | "sad"
  | "angry"

export interface ReactionDef {
  key: ReactionKey
  label: string
  unicode: string
  /** Public asset path under `/public`. Empty string → use unicode only. */
  lottiePath: string
}

export const REACTIONS: ReactionDef[] = [
  { key: "like", label: "Like", unicode: "👍", lottiePath: "/lottie/Like.json" },
  { key: "fire", label: "Fire", unicode: "🔥", lottiePath: "/lottie/Fire.json" },
  { key: "lmao", label: "LMAO", unicode: "😂", lottiePath: "/lottie/LMAO.json" },
  { key: "clap", label: "Clap", unicode: "👏", lottiePath: "/lottie/Clap.json" },
  { key: "cool", label: "Cool", unicode: "😎", lottiePath: "/lottie/Cool.json" },
  {
    key: "mind_blown",
    label: "Mind Blown",
    unicode: "🤯",
    lottiePath: "/lottie/MindBlown.json",
  },
  {
    key: "thinking",
    label: "Thinking",
    unicode: "🤔",
    lottiePath: "/lottie/Thinking.json",
  },
  {
    key: "raised_eyebrow",
    label: "Raised Eyebrow",
    unicode: "🤨",
    lottiePath: "/lottie/RaisedEyebrow.json",
  },
  { key: "sad", label: "Sad", unicode: "😢", lottiePath: "/lottie/Sad.json" },
  { key: "angry", label: "Angry", unicode: "😠", lottiePath: "/lottie/Angry.json" },
]

const REACTION_BY_KEY: Record<ReactionKey, ReactionDef> = REACTIONS.reduce(
  (acc, r) => {
    acc[r.key] = r
    return acc
  },
  {} as Record<ReactionKey, ReactionDef>,
)

export function getReactionDef(key: ReactionKey | string): ReactionDef | null {
  return REACTION_BY_KEY[key as ReactionKey] ?? null
}

/**
 * Lottie cache so we don't re-fetch the same JSON for every render of a
 * timeline (six reactions × N rows). Fetched JSON sits at module scope
 * keyed by URL.
 */
const lottieCache = new Map<string, unknown>()
const inflight = new Map<string, Promise<unknown>>()

async function loadLottie(path: string): Promise<unknown> {
  const hit = lottieCache.get(path)
  if (hit) return hit
  const pending = inflight.get(path)
  if (pending) return pending
  const fetchPromise = fetch(path)
    .then((res) => {
      if (!res.ok) throw new Error(`lottie load failed: ${res.status}`)
      return res.json()
    })
    .then((json) => {
      lottieCache.set(path, json)
      inflight.delete(path)
      return json
    })
    .catch((err) => {
      inflight.delete(path)
      throw err
    })
  inflight.set(path, fetchPromise)
  return fetchPromise
}

interface ReactionGlyphProps {
  reaction: ReactionDef
  /** When `false`, glyph is static + grayscale (Telegram resting state).
   *  When `true`, the Lottie plays once and stays at its final colored
   *  frame; the static unicode shows in full color too. */
  active: boolean
  /** Set to true while the user is actively hovering the picker — plays
   *  the Lottie once as a preview without committing the reaction. */
  preview?: boolean
  size?: number
  className?: string
}

/**
 * Single reaction glyph with the Telegram-style grayscale-resting +
 * play-once-on-active treatment. Lottie is loaded lazily via fetch and
 * cached at module scope so subsequent renders are free.
 */
function ReactionGlyph({
  reaction,
  active,
  preview,
  size = 28,
  className,
}: ReactionGlyphProps) {
  const [data, setData] = useState<unknown | null>(() =>
    reaction.lottiePath ? (lottieCache.get(reaction.lottiePath) ?? null) : null,
  )
  const [errored, setErrored] = useState(false)
  const lottieRef = useRef<LottieRefCurrentProps>(null)
  const animatedOnce = useRef(false)

  useEffect(() => {
    if (!reaction.lottiePath || data || errored) return
    let cancelled = false
    loadLottie(reaction.lottiePath)
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {
        if (!cancelled) setErrored(true)
      })
    return () => {
      cancelled = true
    }
  }, [reaction.lottiePath, data, errored])

  // Trigger play-once when becoming active or on preview hover. Stop
  // and rewind when going inactive so the resting frame is always the
  // grayscale state.
  useEffect(() => {
    const ref = lottieRef.current
    if (!ref) return
    if (active || preview) {
      try {
        ref.stop()
        ref.play()
        animatedOnce.current = true
      } catch {
        /* lottie ref may not be ready on first paint */
      }
    } else if (animatedOnce.current) {
      try {
        ref.stop()
        ref.goToAndStop(0, true)
      } catch {
        /* ignore */
      }
    }
  }, [active, preview])

  const dim: CSSProperties = { width: size, height: size }

  if (!reaction.lottiePath || errored || !data) {
    return (
      <span
        className={cn(
          "inline-flex select-none items-center justify-center text-[1.5rem] leading-none transition-all duration-300",
          !active && "grayscale opacity-60",
          (active || preview) && "scale-110",
          className,
        )}
        style={{ fontSize: size * 0.78, ...dim }}
        aria-hidden
      >
        {reaction.unicode}
      </span>
    )
  }

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center transition-all duration-300",
        !active && !preview && "grayscale opacity-65",
        (active || preview) && "scale-110",
        className,
      )}
      style={dim}
    >
      <Lottie
        animationData={data as Record<string, unknown>}
        autoplay={false}
        loop={false}
        lottieRef={lottieRef}
        style={dim}
        rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
      />
    </span>
  )
}

interface ReactionPickerProps {
  /** Currently active reaction by the viewer, or null. */
  active: ReactionKey | null
  /** Per-reaction counts as returned by the API. */
  counts: Partial<Record<ReactionKey, number>>
  onToggle: (key: ReactionKey) => void
  /** Lightweight inline mode renders a single button + popover with the
   *  six reactions; default is the Telegram-style row of count chips
   *  alongside the picker trigger. */
  variant?: "chip-row" | "trigger-only"
  size?: "sm" | "md"
  disabled?: boolean
  className?: string
}

/**
 * Picker trigger + reaction row. Behaviour matches Telegram:
 *   - resting: grayscale unicode/lottie at 65% opacity
 *   - hovering a reaction in the popover: that reaction plays once
 *     (preview), others stay grayscale
 *   - clicking commits the reaction; the row chip near the trigger
 *     animates to its colored state, picker closes
 *   - clicking the active chip again removes the reaction
 */
export function ReactionPicker({
  active,
  counts,
  onToggle,
  variant = "chip-row",
  size = "sm",
  disabled,
  className,
}: ReactionPickerProps) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<ReactionKey | null>(null)

  const totalCount = useMemo(
    () =>
      (Object.values(counts) as number[]).reduce(
        (sum, n) => sum + (n ?? 0),
        0,
      ),
    [counts],
  )
  const sortedKeys = useMemo(() => {
    return REACTIONS.map((r) => r.key).sort((a, b) => {
      const ca = counts[a] ?? 0
      const cb = counts[b] ?? 0
      if (cb !== ca) return cb - ca
      return REACTIONS.findIndex((r) => r.key === a) -
        REACTIONS.findIndex((r) => r.key === b)
    })
  }, [counts])

  const triggerSize = size === "sm" ? 18 : 22
  const popoverGlyphSize = size === "sm" ? 30 : 38

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label="React"
              className={cn(
                "gap-1.5 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground",
                // trigger-only modda aktif reaksiyon trigger'da gösterilir →
                // hafif vurgu. chip-row'da aktif reaksiyon chip olarak görünür,
                // trigger HER ZAMAN nötr "react" ikonu (kafa karıştıran
                // her-zaman-duran reaksiyon glyph'i kaldırıldı).
                variant === "trigger-only" && active && "bg-accent text-foreground",
              )}
            >
              {variant === "trigger-only" && active && REACTION_BY_KEY[active] ? (
                <ReactionGlyph
                  reaction={REACTION_BY_KEY[active]}
                  active
                  size={triggerSize}
                />
              ) : (
                <HugeiconsIcon
                  icon={SmileIcon}
                  strokeWidth={2}
                  className="size-4"
                />
              )}
              {variant === "trigger-only" && totalCount > 0 ? (
                <span className="tabular-nums">{totalCount}</span>
              ) : null}
            </Button>
          }
        />
        <PopoverContent
          align="start"
          side="top"
          sideOffset={6}
          className="w-auto rounded-full border-none bg-popover/95 p-1.5 shadow-lg backdrop-blur-md"
        >
          <div className="flex items-center gap-0.5">
            {REACTIONS.map((r, i) => {
              const isActive = active === r.key
              const isHover = hover === r.key
              return (
                <motion.button
                  key={r.key}
                  type="button"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                  onMouseEnter={() => setHover(r.key)}
                  onMouseLeave={() =>
                    setHover((prev) => (prev === r.key ? null : prev))
                  }
                  onFocus={() => setHover(r.key)}
                  onBlur={() =>
                    setHover((prev) => (prev === r.key ? null : prev))
                  }
                  onClick={() => {
                    onToggle(r.key)
                    setOpen(false)
                  }}
                  aria-label={r.label}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full transition-colors",
                    "hover:bg-accent",
                    isActive && "bg-accent",
                  )}
                >
                  <ReactionGlyph
                    reaction={r}
                    active={isActive}
                    preview={isHover}
                    size={popoverGlyphSize}
                  />
                </motion.button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>

      {variant === "chip-row" && (
        <AnimatePresence initial={false}>
          {sortedKeys
            .filter((k) => (counts[k] ?? 0) > 0)
            .slice(0, 4)
            .map((k) => {
              const r = REACTION_BY_KEY[k]
              const isActive = active === k
              return (
                <motion.button
                  key={k}
                  type="button"
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  onClick={() => onToggle(k)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full border bg-card px-1.5 text-[11px] transition-colors",
                    isActive
                      ? "border-primary/50 bg-primary/5"
                      : "hover:bg-accent",
                  )}
                >
                  <ReactionGlyph reaction={r} active={isActive} size={16} />
                  <span className="tabular-nums text-muted-foreground">
                    {counts[k]}
                  </span>
                </motion.button>
              )
            })}
        </AnimatePresence>
      )}
    </div>
  )
}

/** Inline static glyph helper for non-interactive contexts. */
export function ReactionStaticGlyph({
  keyName,
  active,
  size = 18,
  className,
}: {
  keyName: ReactionKey
  active?: boolean
  size?: number
  className?: string
}) {
  const r = REACTION_BY_KEY[keyName]
  if (!r) return null
  return (
    <ReactionGlyph
      reaction={r}
      active={active ?? false}
      size={size}
      className={className}
    />
  )
}
