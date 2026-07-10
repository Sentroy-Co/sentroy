import { notFound } from "next/navigation"
import { buildPublicSnapshot } from "@workspace/console/handlers/status-page-public"
import type { PublicStatusSnapshot } from "@workspace/console/handlers/status-page-public"
import {
  getPublicStrings,
  resolvePublicLang,
  type PublicStrings,
} from "../../../../lib/public-strings"

export const dynamic = "force-dynamic"
export const revalidate = 30

interface Props {
  params: Promise<{ slug: string; lang: string }>
  searchParams: Promise<{ lang?: string }>
}

/**
 * Embed widget — iframe-friendly minimal badge. Tek satır status, hover
 * efekti, dark mode auto. RP kendi sitesine iframe ile embed eder:
 *
 *   <iframe src="https://status.sentroy.com/p/{slug}/embed"
 *           width="320" height="80" style="border:0" loading="lazy">
 *
 * App router'da page `<html>` döndüremez (root layout'la conflict).
 * Root layout (`apps/status/app/layout.tsx`) `<html lang="en"><body>` döner;
 * burada sadece body content rendered ediliyor. Root layout `bg-background`
 * uyguluyor ama embed transparent görünmesi için inline `background:
 * transparent` style override.
 */
export default async function StatusEmbedPage({ params, searchParams }: Props) {
  const { slug, lang } = await params
  const { lang: queryLang } = await searchParams
  const resolved = await resolvePublicLang(lang || queryLang)
  const snapshot = await buildPublicSnapshot(slug, { lang: resolved })
  if (!snapshot) notFound()

  const t = getPublicStrings(resolved)
  const { branding, name } = snapshot.page
  const accent = branding.primaryColor || "#111111"
  const displayName = branding.displayName || name
  const cfg = statusConfig(snapshot.overall, t)

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html, body { margin:0; padding:0; background: transparent !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
            .embed-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px 14px; display:flex; align-items:center; gap:12px; min-height:56px; box-sizing:border-box; transition: border-color .15s ease; color:#111; }
            .embed-card:hover { border-color:#9ca3af; }
            @media (prefers-color-scheme: dark) {
              .embed-card { background:#18181b; border-color:#27272a; color:#f5f5f5; }
              .embed-card:hover { border-color:#52525b; }
              .embed-label { color:#a1a1aa !important; }
            }
            .embed-dot-wrap { position:relative; display:inline-flex; width:12px; height:12px; flex-shrink:0; }
            .embed-ping { position:absolute; inset:0; border-radius:9999px; opacity:.6; animation: pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite; }
            .embed-dot { position:relative; width:12px; height:12px; border-radius:9999px; }
            @keyframes pulse { 0%,100% { transform: scale(1); opacity:.6 } 50% { transform: scale(1.6); opacity:0 } }
            .embed-text { flex:1; min-width:0; }
            .embed-label { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#71717a; font-weight:600; line-height:1; }
            .embed-status { font-size:14px; font-weight:600; margin-top:4px; line-height:1.2; }
            .embed-link { color:inherit; text-decoration:none; display:block; }
            .embed-arrow { color:#a1a1aa; font-size:16px; flex-shrink:0; }
          `,
        }}
      />
      <a
        href={`/${resolved}/p/${snapshot.page.slug}`}
        target="_top"
        className="embed-link"
      >
        <div className="embed-card">
          <span className="embed-dot-wrap">
            <span className="embed-ping" style={{ background: cfg.color }} />
            <span className="embed-dot" style={{ background: cfg.color }} />
          </span>
          <div className="embed-text">
            <div className="embed-label" style={{ color: accent }}>
              {displayName}
            </div>
            <div className="embed-status" style={{ color: cfg.color }}>
              {cfg.label}
            </div>
          </div>
          <span className="embed-arrow">↗</span>
        </div>
      </a>
    </>
  )
}

function statusConfig(
  overall: PublicStatusSnapshot["overall"],
  t: PublicStrings,
): { label: string; color: string } {
  const colorMap = {
    operational: "#10b981",
    degraded: "#f59e0b",
    down: "#ef4444",
    maintenance: "#3b82f6",
    "no-data": "#64748b",
  } as const
  return { label: t.overall[overall], color: colorMap[overall] }
}
