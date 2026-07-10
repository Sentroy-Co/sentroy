import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import {
  categoryMeta,
  toolLocale,
  toolUrl,
  LIVE_TOOLS,
  PLATFORM_APPS,
  platformUrl,
  type ToolEntry,
  type PlatformApp,
} from "./catalog"

/** Bir tool'u OS penceresinde açmak için AppDescriptor üret (id = `tool:<id>`). */
export function toolDescriptor(t: ToolEntry, lang: string): AppDescriptor {
  const meta = categoryMeta(t.category)
  return {
    id: `tool:${t.id}`,
    name: toolLocale(t, lang).title,
    description: "",
    cta: "",
    icon: meta.icon,
    color: meta.color,
    href: toolUrl(t, lang),
  }
}

/** Platform downloader (youtube/instagram) için AppDescriptor (id = `platform:<key>`). */
export function platformDescriptor(p: PlatformApp, lang: string): AppDescriptor {
  return {
    id: `platform:${p.key}`,
    name: p.label,
    description: "",
    cta: "",
    icon: p.icon,
    color: p.color,
    href: platformUrl(p, lang),
  }
}

/** Pin id → AppDescriptor (dock'ta sabit/kapalı item'ları çözmek için). */
export function resolveDockId(id: string, lang: string): AppDescriptor | null {
  if (id.startsWith("tool:")) {
    const t = LIVE_TOOLS.find((x) => `tool:${x.id}` === id)
    return t ? toolDescriptor(t, lang) : null
  }
  if (id.startsWith("platform:")) {
    const p = PLATFORM_APPS.find((x) => `platform:${x.key}` === id)
    return p ? platformDescriptor(p, lang) : null
  }
  return null
}
