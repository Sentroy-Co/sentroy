"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { Logo, PageLoading } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { ProtectedEmailsGate } from "./protected-emails-gate"
import { resolveLocalized } from "@/lib/protect-emails"

interface Page {
  title: Record<string, string> | string
  content: Record<string, string> | string
  updatedAt: string
}

export function StaticPageContent() {
  const params = useParams()
  const slug = params.slug as string
  const lang = params.lang as string

  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

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

  const title = resolveLocalized(page!.title, lang)
  const content = resolveLocalized(page!.content, lang)

  return (
    <div className="flex min-h-svh flex-col">
      <header
        data-app-chrome
        className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl"
      >
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
          ref={contentRef}
          className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
          dangerouslySetInnerHTML={{ __html: content }}
        />
        {/* İçerikteki korumalı e-postalar (.sp-email span'leri) → Turnstile ile aç. */}
        <ProtectedEmailsGate slug={slug} lang={lang} containerRef={contentRef} />
      </main>
      <footer data-app-chrome className="mt-auto border-t">
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
