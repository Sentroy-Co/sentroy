import type { Metadata } from "next"
import { CodeBlock, InlineCode } from "../components/code-block"
import { Callout, Lede, Para, PropsTable, Section, Sub } from "../components/docs-ui"
import { EndpointExample } from "../components/endpoint-example"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "Storage — S3-compatible object storage + CDN",
  description:
    "Sentroy Storage is an open alternative to AWS S3, Cloudflare R2, and Backblaze B2 — buckets, multipart upload, signed URLs, image transformations, and CDN serving via cdn.sentroy.com.",
}

export default function StorageDocsPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reference / Storage
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Storage</h1>
          <Lede>
            Organize files into isolated buckets, upload from the browser or Node.js, and serve thumbnails
            straight from the CDN.
          </Lede>
        </div>
      </header>

      <Section
        id="buckets"
        title="Buckets"
        description={
          <>
            Buckets are isolated containers with their own visibility (public vs. private) and usage counters.
            Toggling <InlineCode>isPublic</InlineCode> cascades to every file&apos;s ACL.
          </>
        }
      >
        <Sub id="buckets-list" title="List buckets">
          <EndpointExample
            method="GET"
            service="storage"
            path="/buckets"
            ts={`const buckets = await sentroy.buckets.list()`}
            go={`buckets, err := client.Buckets.List()`}
            python={`buckets = sentroy.buckets.list()`}
            php={`$buckets = $sentroy->buckets->getAll();`}
          />
        </Sub>

        <Sub id="buckets-get" title="Get bucket">
          <EndpointExample
            method="GET"
            service="storage"
            path="/buckets/{slug}"
            ts={`const bucket = await sentroy.buckets.get("product-assets")`}
            go={`bucket, err := client.Buckets.Get("product-assets")`}
            python={`bucket = sentroy.buckets.get("product-assets")`}
            php={`$bucket = $sentroy->buckets->get('product-assets');`}
          />
        </Sub>

        <Sub id="buckets-create" title="Create bucket">
          <EndpointExample
            method="POST"
            service="storage"
            path="/buckets"
            body={`{
  "name": "User Uploads",
  "description": "Avatars and profile media",
  "isPublic": false
}`}
            ts={`const created = await sentroy.buckets.create({
  name: "User Uploads",
  description: "Avatars and profile media",
  isPublic: false,
})`}
            go={`bucket, err := client.Buckets.Create(sentroy.CreateBucketParams{
    Name:        "User Uploads",
    Description: "Avatars and profile media",
    IsPublic:    false,
})`}
            python={`bucket = sentroy.buckets.create(
    name="User Uploads",
    description="Avatars and profile media",
    is_public=False,
)`}
            php={`$bucket = $sentroy->buckets->create([
    'name'        => 'User Uploads',
    'description' => 'Avatars and profile media',
    'is_public'   => false,
]);`}
          />
          <Para>
            <InlineCode>slug</InlineCode> is auto-derived from <InlineCode>name</InlineCode> if omitted.
          </Para>
        </Sub>

        <Sub id="buckets-update" title="Update bucket">
          <EndpointExample
            method="PATCH"
            service="storage"
            path="/buckets/{slug}"
            body={`{ "isPublic": true }`}
            ts={`await sentroy.buckets.update("product-assets", { isPublic: true })`}
            go={`bucket, err := client.Buckets.Update("product-assets", sentroy.UpdateBucketParams{
    IsPublic: sentroy.Ptr(true),
})`}
            python={`sentroy.buckets.update("product-assets", is_public=True)`}
            php={`$sentroy->buckets->update('product-assets', ['is_public' => true]);`}
          />
        </Sub>

        <Sub id="buckets-delete" title="Delete bucket">
          <EndpointExample
            method="DELETE"
            service="storage"
            path="/buckets/{slug}?force=true"
            ts={`await sentroy.buckets.delete("product-assets", { force: true })`}
            go={`err = client.Buckets.Delete("product-assets", &sentroy.DeleteOptions{Force: true})`}
            python={`sentroy.buckets.delete("product-assets", force=True)`}
            php={`$sentroy->buckets->delete('product-assets', true);`}
          />
          <Callout variant="warning">
            Without <InlineCode>force: true</InlineCode>, deleting a non-empty bucket returns a{" "}
            <InlineCode>409 Conflict</InlineCode>. The force option purges every file (S3 objects + thumbnails
            + records) before removing the bucket itself.
          </Callout>
        </Sub>
      </Section>

      <Section
        id="media"
        title="Media"
        description="Upload, list, download, and delete files inside a bucket. The same access token authorizes both mail and storage calls — no separate credential."
      >
        <Sub id="media-list" title="List files">
          <EndpointExample
            method="GET"
            service="storage"
            path="/buckets/{slug}/media?type=image&limit=50"
            ts={`const { items, total } = await sentroy.media.list("product-assets", {
  type: "image",
  limit: 50,
})`}
            go={`result, err := client.Media.List("product-assets", &sentroy.MediaListParams{
    Type:  sentroy.MediaTypeImage,
    Limit: 50,
})`}
            python={`result = sentroy.media.list("product-assets", type="image", limit=50)`}
            php={`$result = $sentroy->media->getAll('product-assets', [
    'type'  => 'image',
    'limit' => 50,
]);`}
          />
        </Sub>

        <Sub id="media-get" title="Get media record">
          <EndpointExample
            method="GET"
            service="storage"
            path="/buckets/{slug}/media/{id}"
            ts={`const media = await sentroy.media.get("product-assets", mediaId)`}
            go={`media, err := client.Media.Get("product-assets", "media-id")`}
            python={`media = sentroy.media.get("product-assets", "media-id")`}
            php={`$media = $sentroy->media->get('product-assets', 'media-id');`}
          />
        </Sub>

        <Sub id="media-upload" title="Upload">
          <Para>
            Multipart form upload — the SDK builds the form for you. The cURL example below uses{" "}
            <InlineCode>-F</InlineCode> to stand in for the SDK&apos;s FormData.
          </Para>
          <Para>
            <strong>Browser</strong> — pass a <InlineCode>File</InlineCode> from an{" "}
            <InlineCode>&lt;input type=&quot;file&quot;&gt;</InlineCode>:
          </Para>
          <EndpointExample
            method="POST"
            service="storage"
            path="/buckets/{slug}/media"
            curl={`curl -X POST "https://sentroy.com/api/storage/companies/my-company/buckets/{slug}/media" \\
  -H "Authorization: Bearer stk_..." \\
  -F "file=@./photo.jpg" \\
  -F "folder=products" \\
  -F "tags[]=v1" \\
  -F "tags[]=cover"`}
            ts={`const input = document.querySelector<HTMLInputElement>("input[type=file]")!
const file = input.files![0]
const uploaded = await sentroy.media.upload("product-assets", {
  body: file,
  folder: "products",
  tags: ["v1", "cover"],
})
console.log(uploaded.url) // Public CDN URL`}
            go={`f, _ := os.Open("./photo.jpg")
defer f.Close()
uploaded, err := client.Media.Upload("product-assets", sentroy.UploadMediaParams{
    Filename: "photo.jpg",
    Body:     f,
    Folder:   "products",
    Tags:     []string{"v1", "cover"},
})
fmt.Println(uploaded.URL) // Public CDN URL`}
            python={`uploaded = sentroy.media.upload(
    "product-assets",
    body="./photo.jpg",
    folder="products",
    tags=["v1", "cover"],
)
print(uploaded.url)  # Public CDN URL`}
            php={`$uploaded = $sentroy->media->upload('product-assets', [
    'body'         => file_get_contents('./photo.jpg'),
    'filename'     => 'photo.jpg',
    'content_type' => 'image/jpeg',
    'folder'       => 'products',
    'tags'         => ['v1', 'cover'],
]);
echo $uploaded['url']; // Public CDN URL`}
          />
          <Para>
            <strong>Node.js</strong> — convert a file to a Blob via <InlineCode>openAsBlob</InlineCode>:
          </Para>
          <CodeBlock
            lang="ts"
            code={`import { openAsBlob } from "node:fs"

const blob = await openAsBlob("./photo.jpg")
const uploaded = await sentroy.media.upload("product-assets", {
  body: blob,
  filename: "photo.jpg",
  isPublic: true,
})`}
          />

          <Para>
            <strong>Video processing</strong> — videos can opt into two
            server-side flags. <InlineCode>compressVideo</InlineCode> re-encodes
            the source at the same resolution (typically 30–60% smaller, no
            visible quality loss) and runs synchronously.{" "}
            <InlineCode>transcodeVideo</InlineCode> implies{" "}
            <InlineCode>compressVideo</InlineCode> and additionally generates a{" "}
            <strong>144p / 480p / 720p / 1080p</strong> ladder. Ladder generation
            is asynchronous: the upload response returns immediately with{" "}
            <InlineCode>processing.status === &quot;queued&quot;</InlineCode>,
            then ladder rungs stream into{" "}
            <InlineCode>videoMeta.variants</InlineCode> over the next few
            minutes. Ladder rungs are reachable at{" "}
            <InlineCode>/f/&lt;mediaId&gt;/&lt;height&gt;</InlineCode> (e.g.{" "}
            <InlineCode>/f/abc/720</InlineCode>).
          </Para>
          <EndpointExample
            method="POST"
            service="storage"
            path="/buckets/{slug}/media (video, multi-quality)"
            curl={`curl -X POST "https://sentroy.com/api/storage/companies/my-company/buckets/{slug}/media" \\
  -H "Authorization: Bearer stk_..." \\
  -F "file=@./reel.mp4" \\
  -F "compressVideo=true" \\
  -F "transcodeVideo=true"`}
            ts={`const uploaded = await sentroy.media.upload("clips", {
  body: videoFile,
  compressVideo: true,
  transcodeVideo: true,
})

// Response is immediate; ladder fills in over time:
//   uploaded.processing.status        // "queued" | "processing" | "completed"
//   uploaded.processing.variantsTotal // 4
//   uploaded.videoMeta.variants       // [] at first, fills with each rung

// Poll until done:
let media = uploaded
while (
  media.processing &&
  media.processing.status !== "completed" &&
  media.processing.status !== "failed"
) {
  await new Promise((r) => setTimeout(r, 4000))
  media = await sentroy.media.get("clips", media.id)
}
console.log(media.videoMeta?.variants.map((v) => v.height))
// → [144, 480, 720, 1080]`}
            go={`uploaded, err := client.Media.Upload("clips", sentroy.UploadMediaParams{
    Filename:       "reel.mp4",
    Body:           f,
    CompressVideo:  true,
    TranscodeVideo: true,
})
// uploaded.Processing.Status == "queued"`}
            python={`uploaded = sentroy.media.upload(
    "clips",
    body="./reel.mp4",
    compress_video=True,
    transcode_video=True,
)
# uploaded.processing.status == "queued"`}
            php={`$uploaded = $sentroy->media->upload('clips', [
    'body'            => file_get_contents('./reel.mp4'),
    'filename'        => 'reel.mp4',
    'compress_video'  => true,
    'transcode_video' => true,
]);`}
          />
          <Para>
            <strong>Latency budget</strong>:{" "}
            <InlineCode>compressVideo</InlineCode> roughly doubles the upload
            handler latency (the request waits for ffmpeg).{" "}
            <InlineCode>transcodeVideo</InlineCode> only adds a probe + bookkeeping
            on the request path; the heavy ladder work runs in the background.
            Plan-tier quotas still meter the final compressed bytes, not the raw
            upload — a sub-second probe response keeps client UIs snappy even on
            very long videos.
          </Para>
        </Sub>

        <Sub id="media-download" title="Download">
          <Para>
            Streams from the storage backend; works for both public and private buckets (auth-gated for
            private). Pass <InlineCode>quality</InlineCode> to fetch a pre-generated thumbnail size.
          </Para>
          <EndpointExample
            method="GET"
            service="storage"
            path="/buckets/{slug}/media/{id}/download?quality=500"
            curl={`curl -X GET "https://sentroy.com/api/storage/companies/my-company/buckets/{slug}/media/{id}/download?quality=500" \\
  -H "Authorization: Bearer stk_..." \\
  --output thumb-500.jpg`}
            ts={`const blob = await sentroy.media.download("product-assets", mediaId)

const thumb = await sentroy.media.download("product-assets", mediaId, {
  quality: 500,
})`}
            go={`bytes, contentType, err := client.Media.Download("product-assets", "media-id", nil)

thumb, _, err := client.Media.Download("product-assets", "media-id",
    &sentroy.DownloadOptions{Quality: 500})`}
            python={`data, content_type = sentroy.media.download("product-assets", "media-id")

thumb, _ = sentroy.media.download(
    "product-assets", "media-id", quality=500,
)`}
            php={`$res = $sentroy->media->download('product-assets', 'media-id');
file_put_contents('./downloaded.jpg', $res['body']);

$thumb = $sentroy->media->download('product-assets', 'media-id', 500);`}
          />
        </Sub>

        <Sub id="media-delete" title="Delete">
          <EndpointExample
            method="DELETE"
            service="storage"
            path="/buckets/{slug}/media/{id}"
            ts={`await sentroy.media.delete("product-assets", mediaId)`}
            go={`err = client.Media.Delete("product-assets", "media-id")`}
            python={`sentroy.media.delete("product-assets", "media-id")`}
            php={`$sentroy->media->delete('product-assets', 'media-id');`}
          />
          <Para>
            Removes the original S3 object, every generated thumbnail, and the media record in one call.
          </Para>
        </Sub>
      </Section>

      <Section
        id="thumbnails"
        title="Thumbnails"
        description="Image uploads automatically get several thumbnail sizes generated by the CDN. Use the helpers below to pick the right URL for your display target — never ship a 4000px JPG into a 56px avatar."
      >
        <CodeBlock
          lang="ts"
          code={`import {
  pickThumbnailUrl,
  pickPresetThumbnailUrl,
  THUMBNAIL_PRESETS,
} from "@sentroy-co/client-sdk"

// Manual target (px) — pass display size * 2 for retina
const avatarUrl = pickThumbnailUrl(media, 56 * 2)

// Semantic preset
const cardUrl = pickPresetThumbnailUrl(media, "card")       // ~500 px
const previewUrl = pickPresetThumbnailUrl(media, "preview") // ~960 px`}
        />

        <Sub title="How it picks">
          <Para>
            The helper picks the smallest thumbnail that still <strong>covers</strong> the target (so you never
            upscale), then falls back through:
          </Para>
          <ol className="my-4 list-decimal space-y-1.5 pl-6 text-[14px] text-muted-foreground">
            <li>
              <code className="font-mono text-foreground">thumbnail.url</code> if the backend exposed it directly
            </li>
            <li>
              CDN-prefix + <code className="font-mono text-foreground">thumbnail.fileName</code> derived from{" "}
              <code className="font-mono text-foreground">media.url</code>
            </li>
            <li>
              proxy <code className="font-mono text-foreground">media.downloadUrl?quality=N</code> for private
              buckets
            </li>
            <li>
              <code className="font-mono text-foreground">media.url</code> /{" "}
              <code className="font-mono text-foreground">media.downloadUrl</code> if no thumbnails exist
              (non-image, or upload before processing finished)
            </li>
          </ol>
          <Para>
            Returns <InlineCode>undefined</InlineCode> only when the media has no public URL at all.
          </Para>
        </Sub>

        <Sub title="Presets">
          <PropsTable
            rows={[
              { name: "avatar", type: "128 px", description: "Round chips, 28-64 px display @2x" },
              { name: "card", type: "500 px", description: "Grid / list cards, 200-300 px display" },
              { name: "preview", type: "960 px", description: "Modal / detail view" },
              { name: "hero", type: "1600 px", description: "Full-bleed hero, edge cases" },
            ]}
          />
        </Sub>
      </Section>

      <PageFooter current="/docs/storage" />
    </article>
  )
}
