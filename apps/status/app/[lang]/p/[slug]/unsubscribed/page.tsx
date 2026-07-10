import Link from "next/link"
import { getPublicStrings, resolvePublicLang } from "../../../../lib/public-strings"

interface Props {
  params: Promise<{ slug: string; lang: string }>
  searchParams: Promise<{ lang?: string; already?: string }>
}

export default async function UnsubscribedPage({ params, searchParams }: Props) {
  const { slug, lang } = await params
  const { lang: queryLang, already } = await searchParams
  const resolved = await resolvePublicLang(lang || queryLang)
  const t = getPublicStrings(resolved)

  const heading = already ? t.unsubAlreadyTitle : t.unsubTitle
  const body = t.unsubDescription
  const back = t.unsubBack

  return (
    <div className="min-h-svh bg-background text-foreground flex items-center justify-center p-4">
      <main className="max-w-md text-center space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-500/15 text-zinc-600 dark:text-zinc-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{heading}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </div>
        <Link
          href={`/${resolved}/p/${slug}`}
          className="inline-flex items-center justify-center rounded-md border px-5 py-2 text-sm font-medium hover:bg-muted"
        >
          {back}
        </Link>
      </main>
    </div>
  )
}
