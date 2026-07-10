import { headers } from "next/headers"
import { PLATFORMS, platformFromHost, siteSection } from "@/lib/platform"
import { routing } from "@/i18n/routing"
import { BLOG_TOPICS } from "@/lib/blog/topics"
import { blogUrl, blogIndexPath } from "@/lib/blog/url"
import { toolsByCategory, categoryLabel, toolPath } from "@/lib/tools/registry"

/**
 * /llms.txt — LLM dostu site özeti (llmstxt.org konvansiyonu). Host'tan
 * section/platform çözer; o host'un sayfalarını listeler (tools↔download izole).
 */
export const dynamic = "force-dynamic"

function plain(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  })
}

export async function GET() {
  const host = (await headers()).get("host") || "youtube.sentroy.com"
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"
  const base = `${proto}://${host}`
  const def = routing.defaultLocale

  // ── tools.sentroy.com → araç kataloğu ──
  if (siteSection(host) === "tools") {
    const toolLines: string[] = [
      "# Sentroy Tools",
      "",
      "> A growing set of free online tools — PDF, image and video utilities that run in your browser, plus paid creator tools. No signup required for free tools.",
      "",
      "## Tools",
    ]
    for (const g of toolsByCategory(def)) {
      toolLines.push("", `### ${categoryLabel(g.category, def)}`)
      for (const tool of g.tools) {
        const loc = tool.locales[def]!
        const tag = tool.status === "soon" ? " (coming soon)" : ""
        toolLines.push(`- [${loc.title}](${base}${toolPath(def, loc.slug)})${tag}: ${loc.description}`)
      }
    }
    toolLines.push(
      "",
      "## Notes",
      "- Free file tools run entirely in your browser — files never leave your device.",
      "- Available in 10 languages (en, tr, es, pt, de, fr, ru, ar, hi, id).",
      "",
    )
    return plain(toolLines.join("\n"))
  }

  const platform = platformFromHost(host)
  const cfg = PLATFORMS[platform]

  const topics = BLOG_TOPICS.filter((t) => t.platform === platform && t.locales[def])

  const lines: string[] = [
    `# ${cfg.label} Downloader — Sentroy`,
    "",
    `> Free, fast ${cfg.label} video and audio downloader by Sentroy. Paste a link and download MP4 video (up to 1080p) or convert to MP3, WAV or M4A. No signup, no app, no install. Prepared files are auto-deleted within 1 hour.`,
    "",
    "## Key pages",
    `- [${cfg.label} Downloader (home)](${base}/): paste a link, pick quality or audio format, download.`,
    `- [Guides](${base}${blogIndexPath(def)}): how-to guides for downloading and converting ${cfg.label} content.`,
    "",
    "## Guides",
    ...topics.map((t) => {
      const loc = t.locales[def]!
      return `- [${loc.title}](${blogUrl(base, def, loc.slug)}): ${loc.keyword}.`
    }),
    "",
    "## Shortcut",
    `- Replace \`${cfg.host.replace(/^[^.]+\./, "")}\` host with \`${cfg.host}\` in any ${cfg.label} URL (e.g. change youtube.com to ${cfg.host}) to jump straight to the downloader for that video.`,
    "",
    "## Notes",
    "- No account or personal data required.",
    "- Available in 10 languages (en, tr, es, pt, de, fr, ru, ar, hi, id).",
    "- Only download content you own or have permission to use.",
    "",
  ]

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  })
}
