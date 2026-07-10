"use client"

import { useRouter } from "next/navigation"
import { Logo } from "@workspace/console/components/shared"

const illustrations: Record<number, { gradient: string; emoji: string }> = {
  404: { gradient: "from-violet-500 to-indigo-500", emoji: "" },
  500: { gradient: "from-red-500 to-orange-500", emoji: "" },
  403: { gradient: "from-amber-500 to-yellow-500", emoji: "" },
}

export function ErrorPage({
  code = 500,
  title,
  description,
  retry,
}: {
  code?: number
  title: string
  description: string
  retry?: () => void
}) {
  const router = useRouter()
  const illust = illustrations[code] || illustrations[500]

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-2 bg-background p-6 text-foreground">
      <div className="flex max-w-md flex-col items-center text-center">
        {/* Animated code */}
        <div className="relative mb-6">
          <span
            className={`bg-gradient-to-br ${illust.gradient} bg-clip-text text-[120px] font-bold leading-none tracking-tighter text-transparent sm:text-[160px]`}
          >
            {code}
          </span>
          <span className="absolute -right-4 -top-2 text-4xl sm:text-5xl">
            {illust.emoji}
          </span>
        </div>

        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>

        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {description}
        </p>

        <div className="mt-8 flex items-center gap-3">
          {retry && (
            <button
              onClick={retry}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Try again
            </button>
          )}
          <button
            onClick={() => router.push("/")}
            className="inline-flex h-10 items-center gap-2 rounded-full border px-5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Go home
          </button>
        </div>

        <div className="mt-12 opacity-40">
          <Logo size="sm" />
        </div>
      </div>
    </div>
  )
}
