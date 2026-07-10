import { highlight, type SupportedLang } from "../lib/highlight"
import { CodeTabs, type CodeTab } from "./code-tabs"

type Input = { label: string; lang: SupportedLang; code: string }

export async function CodeTabsServer({ tabs }: { tabs: Input[] }) {
  const rendered: CodeTab[] = await Promise.all(
    tabs.map(async (t) => ({
      label: t.label,
      lang: t.lang,
      raw: t.code.trim(),
      html: await highlight(t.code, t.lang),
    })),
  )
  return <CodeTabs tabs={rendered} />
}
