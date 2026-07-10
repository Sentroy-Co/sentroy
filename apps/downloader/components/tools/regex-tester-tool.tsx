"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"

/** Regex tester — canlı eşleşme vurgusu + grup listesi. Saf client. */

const FLAGS: { f: string; label: string }[] = [
  { f: "g", label: "global" },
  { f: "i", label: "ignore case" },
  { f: "m", label: "multiline" },
  { f: "s", label: "dotall" },
  { f: "u", label: "unicode" },
  { f: "y", label: "sticky" },
]
const MAX_LEN = 100_000

interface MatchInfo {
  value: string
  index: number
  groups: string[]
}

export function RegexTesterTool() {
  const t = useTranslations("d")
  const [pattern, setPattern] = useState("\\b(\\w+)@(\\w+)\\.(\\w+)\\b")
  const [flags, setFlags] = useState("g")
  const [text, setText] = useState("İletişim: ada@sentroy.com ve destek@sentroy.dev — hemen yaz.")

  const { error, matches, segments } = useMemo(() => {
    if (!pattern) return { error: null as string | null, matches: [] as MatchInfo[], segments: null }
    const sample = text.slice(0, MAX_LEN)
    let re: RegExp
    try {
      re = new RegExp(pattern, flags)
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid regex", matches: [], segments: null }
    }
    const found: MatchInfo[] = []
    try {
      if (flags.includes("g")) {
        for (const m of sample.matchAll(re)) {
          found.push({ value: m[0], index: m.index ?? 0, groups: m.slice(1).map((g) => g ?? "") })
          if (found.length > 5000) break
        }
      } else {
        const m = re.exec(sample)
        if (m) found.push({ value: m[0], index: m.index ?? 0, groups: m.slice(1).map((g) => g ?? "") })
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Match error", matches: [], segments: null }
    }
    // Vurgu segmentleri (sıfır-uzunluk eşleşmeleri atla)
    const segs: { text: string; hit: boolean }[] = []
    let cursor = 0
    for (const m of found) {
      if (m.value.length === 0) continue
      if (m.index > cursor) segs.push({ text: sample.slice(cursor, m.index), hit: false })
      segs.push({ text: m.value, hit: true })
      cursor = m.index + m.value.length
    }
    if (cursor < sample.length) segs.push({ text: sample.slice(cursor), hit: false })
    return { error: null, matches: found, segments: segs }
  }, [pattern, flags, text])

  const toggleFlag = (f: string) => setFlags((cur) => (cur.includes(f) ? cur.replace(f, "") : cur + f))

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Pattern + flags */}
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
        <div className="flex items-center gap-2 rounded-xl border bg-background px-3 font-mono text-sm focus-within:border-primary">
          <span className="text-muted-foreground">/</span>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            spellCheck={false}
            className="h-10 flex-1 bg-transparent outline-none"
            placeholder="pattern"
          />
          <span className="text-muted-foreground">/{flags}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FLAGS.map(({ f, label }) => (
            <button
              key={f}
              onClick={() => toggleFlag(f)}
              title={label}
              className={
                "rounded-full px-2.5 py-1 font-mono text-xs transition-colors " +
                (flags.includes(f) ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
              }
            >
              {f}
            </button>
          ))}
          <span className="ms-auto self-center text-xs text-muted-foreground">
            {error ? <span className="text-destructive">{error}</span> : t("regexMatchCount", { count: matches.length })}
          </span>
        </div>
      </div>

      {/* Test metni + vurgulu önizleme */}
      <div className="grid gap-3 lg:grid-cols-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={t("regexTestString")}
          className="min-h-48 w-full resize-y rounded-2xl border bg-card p-4 font-mono text-sm leading-relaxed outline-none focus:border-primary"
        />
        <div className="min-h-48 overflow-auto whitespace-pre-wrap break-words rounded-2xl border bg-muted/20 p-4 font-mono text-sm leading-relaxed">
          {segments && segments.length > 0 ? (
            segments.map((s, i) =>
              s.hit ? (
                <mark key={i} className="rounded bg-primary/30 text-foreground">
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )
          ) : (
            <span className="text-muted-foreground/50">{t("regexNoMatch")}</span>
          )}
        </div>
      </div>

      {/* Eşleşme listesi */}
      {matches.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-2xl border bg-card p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("regexMatches")}</span>
          <div className="flex max-h-56 flex-col gap-1 overflow-auto font-mono text-xs">
            {matches.slice(0, 200).map((m, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
                <span className="text-muted-foreground/60">#{i + 1}</span>
                <span className="font-medium text-primary">{m.value}</span>
                <span className="text-muted-foreground/60">@{m.index}</span>
                {m.groups.map((g, gi) => (
                  <span key={gi} className="rounded bg-background px-1.5 py-0.5 text-muted-foreground">
                    ${gi + 1}: {g || "∅"}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
