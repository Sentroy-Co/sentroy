import type { Metadata } from "next"
import { CurlGenerator } from "../../components/curl-generator"
import { Lede, Section } from "../../components/docs-ui"

export const metadata: Metadata = {
  title: "cURL generator",
  description:
    "Pick any Sentroy endpoint, drop in your token + slug, and get a ready-to-paste cURL command.",
}

export default function CurlGeneratorPage() {
  return (
    <article>
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tools
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            cURL generator
          </h1>
          <Lede>
            Pick an endpoint, edit the body if needed, and copy a working cURL.
            Your token and company slug come from the credentials popover in
            the header — fill them once, every snippet on the docs site picks
            them up.
          </Lede>
        </div>
      </header>

      <Section
        id="generator"
        title="Build a request"
        description="Choose an endpoint from the catalog. Path parameters become inline inputs; the body is editable JSON. Output updates as you type."
      >
        <CurlGenerator />
      </Section>
    </article>
  )
}
