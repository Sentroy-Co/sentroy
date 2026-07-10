import Link from "next/link"
import { getPublicStrings, resolvePublicLang } from "../../../lib/public-strings"

interface Props {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ lang?: string }>
}

export default async function SubscribeErrorPage({ params, searchParams }: Props) {
  const { lang } = await params
  const { lang: queryLang } = await searchParams
  const resolved = await resolvePublicLang(lang || queryLang)
  const t = getPublicStrings(resolved)
  const heading = t.subErrTitle
  const body = t.subErrDescription
  const back = t.subErrBack

  return (
    <div className="min-h-svh bg-background text-foreground flex items-center justify-center p-4">
      <main className="max-w-md text-center space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400">
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
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{heading}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </div>
        <Link
          href="https://sentroy.com"
          className="inline-flex items-center justify-center rounded-md border px-5 py-2 text-sm font-medium hover:bg-muted"
        >
          {back}
        </Link>
      </main>
    </div>
  )
}
