"use client"

import { useRouter } from "next/navigation"
import { Logo } from "@workspace/console/components/shared"

/**
 * Sentroy OS-flavoured error surface — ambient brand glow + glass card, aynı
 * dil OS pencereleri/first-run hero'suyla. `[lang]/error.tsx` ve `[lang]/
 * not-found.tsx` bunu kullanır. Buton etiketleri opsiyonel (caller locale'ler);
 * default'lar İngilizce (error boundary bazen i18n provider dışında render olur).
 */
export function ErrorPage({
  code = 500,
  title,
  description,
  retry,
  retryLabel = "Try again",
  homeLabel = "Go home",
}: {
  code?: number
  title: string
  description: string
  retry?: () => void
  retryLabel?: string
  homeLabel?: string
}) {
  const router = useRouter()

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background p-6 text-foreground">
      {/* Ambient brand glow — OS wallpaper hissi (marka kırmızısı #FF1744). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.16] blur-[130px]"
          style={{ background: "radial-gradient(circle, #ff1744, transparent 70%)" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_115%,rgba(255,23,68,0.07),transparent_55%)]" />
      </div>

      {/* Glass card */}
      <div className="flex w-full max-w-md flex-col items-center rounded-[28px] border border-white/12 bg-card/70 px-8 py-10 text-center shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl backdrop-saturate-150 dark:bg-card/50">
        <Logo size="md" />

        <span
          className="mt-8 block text-[96px] font-extrabold leading-none tracking-tighter tabular-nums sm:text-[116px]"
          style={{ color: "#ff1744" }}
        >
          {code}
        </span>

        <h1 className="mt-4 text-xl font-bold tracking-tight text-balance sm:text-2xl">
          {title}
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        <div className="mt-8 flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
          {retry ? (
            <button
              onClick={retry}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90 active:scale-[0.98]"
            >
              {retryLabel}
            </button>
          ) : null}
          <button
            onClick={() => router.push("/")}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background/40 px-5 text-sm font-medium transition hover:bg-muted active:scale-[0.98]"
          >
            {homeLabel}
          </button>
        </div>
      </div>

      <p className="mt-6 text-xs tracking-wide text-muted-foreground/50">sentroy.com</p>
    </div>
  )
}
