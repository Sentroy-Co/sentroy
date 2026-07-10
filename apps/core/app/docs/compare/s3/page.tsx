import type { Metadata } from "next"
import { CodeBlock } from "../../components/code-block"
import { Callout, Lede, Para, Section, Sub } from "../../components/docs-ui"
import { PageFooter } from "../../components/page-footer"

export const metadata: Metadata = {
  title: "Sentroy vs AWS S3 — object storage + CDN comparison",
  description:
    "Side-by-side comparison: Sentroy Storage (managed, bundled CDN + image transforms, flat pricing) vs AWS S3 (the de-facto object store, à la carte CloudFront + Lambda@Edge). Migration guide for file storage.",
}

export default function S3ComparePage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="mb-3 inline-block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Comparison
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Sentroy vs AWS S3</h1>
          <Lede>
            S3 is the de-facto object store. Sentroy Storage is a managed alternative — buckets, multipart upload,
            signed URLs — bundled with a CDN and on-the-fly image transforms. This page is an honest
            side-by-side and a migration snippet so you can decide where each one fits.
          </Lede>
        </div>
      </header>

      <Section
        id="quick-comparison"
        title="Quick comparison"
        description="The five questions most teams care about when picking object storage."
      >
        <div className="my-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-semibold">&nbsp;</th>
                <th className="px-4 py-2.5 font-semibold">Sentroy</th>
                <th className="px-4 py-2.5 font-semibold">AWS S3</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Pricing model</td>
                <td className="px-4 py-3 text-muted-foreground">Flat platform tier; storage + bandwidth bundled</td>
                <td className="px-4 py-3 text-muted-foreground">Per-GB storage + per-request + per-GB egress (CloudFront extra)</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Open formats</td>
                <td className="px-4 py-3 text-muted-foreground">S3-compatible under the hood; standard multipart, signed URLs</td>
                <td className="px-4 py-3 text-muted-foreground">S3 API is the standard the rest of the industry copies</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Lock-in</td>
                <td className="px-4 py-3 text-muted-foreground">Low — S3 backend is yours; SDK is portable</td>
                <td className="px-4 py-3 text-muted-foreground">Moderate — egress fees + IAM integration encourage staying</td>
              </tr>
              <tr className="align-top">
                <td className="px-4 py-3 font-medium text-foreground">Bundled with other products</td>
                <td className="px-4 py-3 text-muted-foreground">CDN + image transforms + mail + auth + vault, one tenant</td>
                <td className="px-4 py-3 text-muted-foreground">Storage only; CloudFront + Lambda@Edge + SES separately</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="same"
        title="What is the same"
        description="The places these two products meaningfully overlap."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>Both are bucket-based object stores with hierarchical key naming.</li>
          <li>Both support multipart upload for large files.</li>
          <li>Both ship signed-URL flows for time-limited browser uploads and reads.</li>
          <li>Both can be backed by the same underlying infrastructure — Sentroy uses S3 (or any compatible) under the hood.</li>
          <li>Both support public, private, and signed object visibility.</li>
        </ul>
      </Section>

      <Section
        id="different"
        title="What is different"
        description="Honest differences in both directions."
      >
        <Sub title="Where Sentroy is different">
          <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
            <li>CDN is built in — uploads are served from <code>cdn.sentroy.com</code> with no separate CloudFront distribution to wire.</li>
            <li>On-the-fly image transforms — request <code>/f/&lt;id&gt;/thumb</code> and Sentroy serves the resized variant via <code>sharp</code>; no Lambda@Edge or separate image service to deploy.</li>
            <li>Cascade delete — deleting a bucket or media row purges the CDN cache and S3 objects atomically.</li>
            <li>Same access token reaches mail / auth / vault; one credential per company.</li>
            <li>Flat pricing — no per-GET, per-PUT, per-egress accounting to model.</li>
          </ul>
        </Sub>

        <Sub title="Where AWS S3 is different">
          <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
            <li>The reference implementation — every other object store copies its API. Maximum tooling ecosystem.</li>
            <li>Storage classes (Glacier, Deep Archive) for cold data at fraction-of-a-cent / GB / month.</li>
            <li>Cross-region replication, versioning, object lock, and a deep IAM matrix — useful for regulated workloads.</li>
            <li>S3 Object Lambda for inline content transforms — when you need something Sentroy&apos;s image pipeline doesn&apos;t cover.</li>
            <li>11 nines of durability with multi-AZ replication baked into the SLA.</li>
          </ul>
        </Sub>
      </Section>

      <Section
        id="pick-sentroy"
        title="When to pick Sentroy"
        description="Concrete situations where Sentroy is the better call."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>You ship user-uploaded images and need responsive thumbnails without writing a transform service.</li>
          <li>You don&apos;t want to model per-request + per-egress + CloudFront pricing — flat fee is easier to predict.</li>
          <li>You already use Sentroy for mail or auth and want avatars / attachments to live in the same tenant.</li>
          <li>You want a single SDK call for upload-and-serve, with the CDN URL returned in the response.</li>
        </ul>
      </Section>

      <Section
        id="stick-with-s3"
        title="When to stick with AWS S3"
        description="Cases where staying on S3 is the right call."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>You store cold / archival data at scale — Glacier / Deep Archive economics aren&apos;t replicated yet.</li>
          <li>You depend on object lock, cross-region replication, or fine-grained IAM for regulatory reasons.</li>
          <li>You&apos;re already deep in the AWS ecosystem — VPC endpoints, Lambda triggers, Athena queries — and S3 is the seam.</li>
        </ul>
        <Callout title="No salt in the wound">
          S3 is foundational infrastructure. If your workload is heavy on archival or you need the AWS feature
          surface, treat Sentroy as a complementary layer (signed-URL handoff) rather than a replacement.
        </Callout>
      </Section>

      <Section
        id="migration"
        title="Migration"
        description="One operation, both SDKs side by side."
      >
        <Para>Upload a file from a server-side route:</Para>

        <CodeBlock
          lang="ts"
          filename="before.ts — AWS S3"
          code={`import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const s3 = new S3Client({ region: "us-east-1" })

await s3.send(
  new PutObjectCommand({
    Bucket: "acme-uploads",
    Key: "avatars/jane.png",
    Body: fileBuffer,
    ContentType: "image/png",
    ACL: "public-read",
  }),
)

const url = \`https://acme-uploads.s3.us-east-1.amazonaws.com/avatars/jane.png\`
// Plus a CloudFront distribution if you want CDN edge caching`}
        />

        <CodeBlock
          lang="ts"
          filename="after.ts — Sentroy"
          code={`import { Sentroy } from "@sentroy-co/client-sdk"

const sentroy = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "acme",
  accessToken: process.env.SENTROY_ACCESS_TOKEN!,
})

const media = await sentroy.media.upload({
  bucketId: "<uploads-bucket-id>",
  file: fileBuffer,
  filename: "jane.png",
  contentType: "image/png",
  visibility: "public",
})

console.log(media.url)       // cdn.sentroy.com/f/<id> — already cached at edge
console.log(media.thumbUrl)  // /f/<id>/thumb — auto image transform`}
        />

        <Para>
          Sentroy returns the public CDN URL and an automatically-derived thumbnail URL in the upload response —
          no separate distribution, no Lambda@Edge, no <code>sharp</code> microservice in your VPC.
        </Para>
      </Section>

      <PageFooter current="/docs/compare/s3" />
    </article>
  )
}
