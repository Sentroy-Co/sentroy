import Link from "next/link"
import { buildPublicSnapshot } from "@workspace/console/handlers/status-page-public"
import { getPublicStrings, resolvePublicLang } from "../../../../lib/public-strings"

interface Props {
  params: Promise<{ slug: string; lang: string }>
  searchParams: Promise<{ lang?: string; already?: string }>
}

export default async function SubscribedPage({ params, searchParams }: Props) {
  const { slug, lang } = await params
  const { lang: queryLang, already } = await searchParams
  const resolved = await resolvePublicLang(lang || queryLang)
  const t = getPublicStrings(resolved)
  const snapshot = await buildPublicSnapshot(slug, { lang: resolved })
  const displayName = snapshot?.page.branding.displayName || snapshot?.page.name || slug

  const heading = already ? t.subscribedAlreadyTitle : t.subscribedTitle
  const body = t.subscribedBody.replace("{name}", displayName)
  const back = t.subscribedBack

  return (
    <div className="min-h-svh bg-background text-foreground flex items-center justify-center p-4">
      <main className="max-w-md text-center space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{heading}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </div>
        <Link
          href={`/${resolved}/p/${slug}`}
          className="inline-flex items-center justify-center rounded-md border border-foreground/20 bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          {back}
        </Link>
      </main>
    </div>
  )
}
