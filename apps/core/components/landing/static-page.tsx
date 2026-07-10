"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Logo, PageLoading } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

interface Page {
  title: Record<string, string> | string
  content: Record<string, string> | string
  updatedAt: string
}

function resolve(val: Record<string, string> | string, lang: string): string {
  if (typeof val === "string") return val
  return val[lang] || val.en || Object.values(val)[0] || ""
}

export function StaticPageContent() {
  const params = useParams()
  const slug = params.slug as string
  const lang = params.lang as string

  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/pages/${slug}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setPage(json.data)
        else setNotFound(true)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) return <PageLoading />

  if (notFound) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Page not found</p>
        <Button variant="outline" render={<a href={`/${lang}`} />}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
          Back
        </Button>
      </div>
    )
  }

  const title = resolve(page!.title, lang)
  const content = resolve(page!.content, lang)

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <a href={`/${lang}`}>
            <Logo size="md" />
          </a>
          <Button variant="ghost" size="sm" render={<a href={`/${lang}`} />}>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold">{title}</h1>
        {page!.updatedAt && (
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {new Date(page!.updatedAt).toLocaleDateString()}
          </p>
        )}
        <div
          className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </main>
      <footer className="mt-auto border-t">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
          <Logo size="sm" />
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Sentroy
          </p>
        </div>
      </footer>
    </div>
  )
}
