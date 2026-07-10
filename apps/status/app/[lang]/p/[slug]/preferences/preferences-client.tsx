"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface Strings {
  title: string
  loading: string
  loadFailed: string
  emailLabel: string
  filterIntro: string
  componentsHeading: string
  saveButton: string
  savingButton: string
  savedToast: string
  saveFailedToast: string
  unsubscribeButton: string
  backLink: string
}

interface PreferencesData {
  subscriber: {
    type: "email" | "webhook"
    target: string
    verified: boolean
    componentFilter: string[]
    topicFilter: string[]
    createdAt: string
  }
  page: {
    slug: string
    name: string
    branding: { displayName?: string | null; primaryColor?: string | null }
  }
  components: Array<{ id: string; name: string }>
}

export function PreferencesClient({
  slug,
  token,
  lang,
  strings,
}: {
  slug: string
  token: string
  lang: string
  strings: Strings
}) {
  const [data, setData] = useState<PreferencesData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(
    new Set(),
  )
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState<"saved" | "failed" | null>(null)

  useEffect(() => {
    fetch(`/api/v1/status/subscribe/preferences?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: PreferencesData | null) => {
        if (!json) {
          setLoadError(true)
          return
        }
        setData(json)
        setSelectedComponents(new Set(json.subscriber.componentFilter))
      })
      .catch(() => setLoadError(true))
  }, [token])

  function toggleComponent(id: string) {
    setSelectedComponents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setSavedFlash(null)
    try {
      const res = await fetch("/api/v1/status/subscribe/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          componentFilter: Array.from(selectedComponents),
        }),
      })
      setSavedFlash(res.ok ? "saved" : "failed")
      setTimeout(() => setSavedFlash(null), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function unsubscribe() {
    window.location.href = `/api/v1/status/subscribe/unsubscribe?token=${encodeURIComponent(token)}`
  }

  if (loadError) {
    return (
      <div className="min-h-svh bg-background text-foreground flex items-center justify-center p-4">
        <main className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">{strings.loadFailed}</h1>
          <Link
            href={`/${lang}/p/${slug}`}
            className="inline-block text-sm underline-offset-2 hover:underline"
          >
            {strings.backLink}
          </Link>
        </main>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-svh bg-background text-foreground flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">{strings.loading}</p>
      </div>
    )
  }

  const accent = data.page.branding.primaryColor || "#111111"
  const displayName = data.page.branding.displayName || data.page.name

  return (
    <div className="min-h-svh bg-background text-foreground p-4">
      <main className="mx-auto max-w-xl pt-12 pb-16 space-y-6">
        <header>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {displayName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{strings.title}</h1>
        </header>

        <div className="rounded-xl border bg-card p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {strings.emailLabel}
          </p>
          <p className="font-mono text-sm">{data.subscriber.target}</p>
        </div>

        {data.components.length > 0 ? (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold">{strings.componentsHeading}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {strings.filterIntro}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.components.map((c) => {
                const active = selectedComponents.has(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleComponent(c.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition ${active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-between">
              {savedFlash === "saved" ? (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  ✓ {strings.savedToast}
                </span>
              ) : savedFlash === "failed" ? (
                <span className="text-[11px] text-red-600 dark:text-red-400">
                  ✗ {strings.saveFailedToast}
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex h-9 items-center rounded-md px-4 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: accent }}
              >
                {saving ? strings.savingButton : strings.saveButton}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-2">
          <Link
            href={`/${lang}/p/${slug}`}
            className="text-xs underline-offset-2 hover:underline"
          >
            {strings.backLink}
          </Link>
          <button
            type="button"
            onClick={unsubscribe}
            className="text-xs text-destructive underline-offset-2 hover:underline"
          >
            {strings.unsubscribeButton}
          </button>
        </div>
      </main>
    </div>
  )
}
