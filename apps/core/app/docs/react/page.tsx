import type { Metadata } from "next"
import { CodeBlock, InlineCode } from "../components/code-block"
import { Callout, Lede, Para, PropsTable, Section, Sub } from "../components/docs-ui"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "React Components",
  description:
    "Drop-in React components for Sentroy storage — MediaManager, MediaManagerTrigger, and Lightbox.",
}

export default function ReactDocsPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reference / React
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">React components</h1>
          <Lede>
            Optional subpath of <InlineCode>@sentroy-co/client-sdk/react</InlineCode>. React and react-dom are
            declared as <strong>optional peer dependencies</strong> — server-only consumers don&apos;t need to
            install them.
          </Lede>
          <CodeBlock lang="bash" code={`npm install react react-dom`} />
        </div>
      </header>

      <Section
        id="media-manager"
        title="MediaManager"
        description="Drop-in storage browser and uploader. Talks to the same Sentroy client you already configured. Styles via Tailwind class names — see the Styling section below for the one-line setup."
      >
        <CodeBlock
          lang="tsx"
          code={`"use client"

import { Sentroy } from "@sentroy-co/client-sdk"
import { MediaManager } from "@sentroy-co/client-sdk/react"

const client = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "my-company",
  accessToken: "stk_...",
})

export default function Page() {
  return (
    <MediaManager
      client={client}
      multiple
      accept="image/*"
      onChange={(selected) => console.log(selected)}
      onSelect={(selected) => console.log("confirmed:", selected)}
    />
  )
}`}
        />

        <Sub title="Features">
          <ul className="my-3 list-disc space-y-2 pl-6 text-[14.5px] text-muted-foreground">
            <li>Bucket selector (auto-picks first if <InlineCode>bucketSlug</InlineCode> not provided)</li>
            <li>Search (filename) + file-type filter (image / video / audio / pdf / doc / archive / code)</li>
            <li>Upload via button <strong>and</strong> drag-and-drop</li>
            <li>Single or multi selection (<InlineCode>multiple</InlineCode> prop)</li>
            <li>
              <InlineCode>initialValue</InlineCode> accepts <InlineCode>Media[]</InlineCode> or{" "}
              <InlineCode>string[]</InlineCode> (id list) — pre-selected on mount, fires{" "}
              <InlineCode>onChange</InlineCode> immediately so parent state stays in sync
            </li>
            <li>
              Press <InlineCode>Space</InlineCode> while a card is selected → opens it in fullscreen{" "}
              <strong>Lightbox</strong>. <InlineCode>Esc</InlineCode> closes,{" "}
              <InlineCode>←/→</InlineCode> step through siblings
            </li>
            <li>
              Detail pane on the right (large screens) — preview, metadata, delete, &quot;Use selection&quot;
              CTA when <InlineCode>onSelect</InlineCode> provided
            </li>
          </ul>
        </Sub>

        <Sub title="Props">
          <PropsTable
            rows={[
              { name: "client", type: "Sentroy", required: true, description: "Configured client instance" },
              { name: "bucketSlug", type: "string", description: "Initial bucket; default = first one in the list" },
              { name: "multiple", type: "boolean", description: "Allow multi-selection. Default false" },
              {
                name: "maxItems",
                type: "number",
                description:
                  "Cap for multi-mode. New selections are silently blocked once reached. Ignored when multiple=false",
              },
              {
                name: "accept",
                type: "string",
                description: 'File type filter — same syntax as <input accept>: "image/*", ".pdf,.docx", combos',
              },
              {
                name: "initialValue",
                type: "Array<Media | string>",
                description: "Pre-selected items (objects or ids)",
              },
              {
                name: "onChange",
                type: "(selected: Media[]) => void",
                description: "Fires on every selection change",
              },
              {
                name: "onSelect",
                type: "(selected: Media[]) => void",
                description: "Fires on confirm — picker dialogs use this",
              },
              {
                name: "bucketFilter",
                type: "(b: Bucket) => boolean",
                description: "Filter the bucket dropdown — hide system buckets",
              },
              { name: "showDetailsPane", type: "boolean", description: "Default true" },
              { name: "showBucketSelector", type: "boolean", description: "Default true" },
              { name: "className", type: "string", description: "Root wrapper class" },
              {
                name: "classNames",
                type: "MediaManagerClassNames",
                description: "Per-region class overrides (see theming)",
              },
            ]}
          />
        </Sub>

        <Sub title="Styling (required)" id="media-manager-styling">
          <Para>
            <strong>MediaManager</strong> renders Tailwind class names at runtime —
            no CSS file to import, but your app&apos;s Tailwind build must <em>discover</em>{" "}
            those class names. By default Tailwind v4 only scans your project&apos;s
            source files, not <InlineCode>node_modules</InlineCode>, so the
            classes inside the shipped SDK bundle would otherwise be tree-shaken
            away and the component would render unstyled.
          </Para>
          <Para>
            Add this <strong>once</strong> to your global stylesheet (
            <InlineCode>app/globals.css</InlineCode>):
          </Para>
          <CodeBlock
            lang="bash"
            filename="app/globals.css"
            code={`@import "tailwindcss";

/* Tell Tailwind to scan Sentroy's React components */
@source "../node_modules/@sentroy-co/client-sdk/dist/react";`}
          />
          <Para>
            Inside a monorepo or non-standard layout, adjust the relative path
            so it resolves to <InlineCode>@sentroy-co/client-sdk/dist/react</InlineCode>.
            You only need this for the React subpath — the rest of the SDK (
            <InlineCode>send</InlineCode>, <InlineCode>media.upload</InlineCode>,{" "}
            <InlineCode>buckets</InlineCode>, etc.) is plain TypeScript with no
            styles.
          </Para>
        </Sub>

        <Sub title="Theming">
          <Para>
            The component uses Tailwind utility classes that consume your design tokens (
            <InlineCode>bg-background</InlineCode>, <InlineCode>text-foreground</InlineCode>,{" "}
            <InlineCode>border-border</InlineCode>, <InlineCode>text-muted-foreground</InlineCode>,{" "}
            <InlineCode>bg-muted</InlineCode>, etc.). Drop-in usage in any shadcn-style codebase needs no extra
            setup beyond the <a href="#media-manager-styling" className="underline underline-offset-2">@source</a> directive
            above.
          </Para>
          <Para>
            For finer control, override individual sections via <InlineCode>classNames</InlineCode>:
          </Para>
          <CodeBlock
            lang="tsx"
            code={`<MediaManager
  client={client}
  className="h-[600px] rounded-2xl border-purple-200"
  classNames={{
    toolbar: "bg-purple-50",
    uploadButton: "bg-purple-600 text-white",
    cardSelected: "ring-purple-400 border-purple-400",
    grid: "sm:grid-cols-2 md:grid-cols-3",
  }}
/>`}
          />
          <Para>
            Available keys: <InlineCode>root</InlineCode>, <InlineCode>toolbar</InlineCode>,{" "}
            <InlineCode>searchInput</InlineCode>, <InlineCode>filterSelect</InlineCode>,{" "}
            <InlineCode>uploadButton</InlineCode>, <InlineCode>bucketSelect</InlineCode>,{" "}
            <InlineCode>grid</InlineCode>, <InlineCode>card</InlineCode>,{" "}
            <InlineCode>cardSelected</InlineCode>, <InlineCode>thumbnail</InlineCode>,{" "}
            <InlineCode>cardMeta</InlineCode>, <InlineCode>empty</InlineCode>, <InlineCode>details</InlineCode>,{" "}
            <InlineCode>dropZoneOverlay</InlineCode>.
          </Para>
        </Sub>
      </Section>

      <Section
        id="media-manager-trigger"
        title="MediaManagerTrigger"
        description={
          <>
            A wrapper that turns <strong>any</strong> clickable element into a media picker. When the user
            clicks the trigger, a portal-rendered modal opens with{" "}
            <InlineCode>MediaManager</InlineCode> inside, and <InlineCode>onSelect</InlineCode> fires with the
            confirmed selection.
          </>
        }
      >
        <Para>
          The use case: you don&apos;t want a giant manager taking up real estate on your settings page — you
          just want a &quot;Change avatar&quot; button (or even a clickable avatar thumbnail) that pops the
          picker on demand.
        </Para>

        <CodeBlock
          lang="tsx"
          code={`"use client"

import { Sentroy } from "@sentroy-co/client-sdk"
import { MediaManagerTrigger } from "@sentroy-co/client-sdk/react"

const client = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "my-company",
  accessToken: "stk_...",
})

export function AvatarPicker({
  current,
  onChange,
}: {
  current: string | null
  onChange: (url: string) => void
}) {
  return (
    <MediaManagerTrigger
      client={client}
      maxItems={1}
      accept="image/*"
      title="Choose your avatar"
      description="Pick an existing image or upload a new one."
      trigger={
        <button className="rounded-full ring-2 ring-border hover:ring-primary">
          {current ? (
            <img src={current} alt="" className="size-10 rounded-full" />
          ) : (
            <span className="grid size-10 place-items-center rounded-full bg-muted text-xs">
              ?
            </span>
          )}
        </button>
      }
      onSelect={(media) => {
        if (media[0]?.url) onChange(media[0].url)
      }}
    />
  )
}`}
        />

        <Sub title="Multi-select with cap">
          <CodeBlock
            lang="tsx"
            code={`<MediaManagerTrigger
  client={client}
  maxItems={5}
  accept="image/*,video/*"
  trigger={<Button>Add gallery items</Button>}
  onSelect={(media) => setGallery(media)}
/>`}
          />
          <Para>
            <InlineCode>maxItems &gt; 1</InlineCode> automatically enables multi-mode. Once the user reaches the
            cap, additional clicks on unselected cards are silently no-op&apos;d — they have to deselect
            something to swap.
          </Para>
        </Sub>

        <Sub title="Controlled mode">
          <Para>
            If you want the parent to drive open/close (e.g. opening from a context menu), pass{" "}
            <InlineCode>open</InlineCode> + <InlineCode>onOpenChange</InlineCode>. The trigger is still rendered
            so its click also opens the modal — to render only the modal, pass an empty fragment for{" "}
            <InlineCode>trigger</InlineCode>.
          </Para>
          <CodeBlock
            lang="tsx"
            code={`const [open, setOpen] = useState(false)

<MediaManagerTrigger
  client={client}
  open={open}
  onOpenChange={setOpen}
  trigger={<></>}
  onSelect={(media) => { /* … */ }}
/>`}
          />
        </Sub>

        <Sub title="Props">
          <PropsTable
            rows={[
              { name: "client", type: "Sentroy", required: true, description: "Same client you pass to MediaManager" },
              {
                name: "trigger",
                type: "ReactNode",
                required: true,
                description:
                  "The clickable element. Wrapped in <span role=\"button\"> with click + keyboard (Enter / Space) handlers",
              },
              {
                name: "onSelect",
                type: "(selected: Media[]) => void",
                required: true,
                description: "Fires when user confirms; modal auto-closes",
              },
              {
                name: "maxItems",
                type: "number",
                description: "1 = single (default), >1 = multi up to cap",
              },
              {
                name: "accept",
                type: "string",
                description: "Same <input accept> syntax — applies to upload and grid filter",
              },
              { name: "title", type: "string", description: 'Modal heading. Default "Select media"' },
              { name: "description", type: "string", description: "Subheading under the title" },
              { name: "open", type: "boolean", description: "Controlled open state" },
              { name: "onOpenChange", type: "(open: boolean) => void", description: "Controlled change handler" },
              {
                name: "disabled",
                type: "boolean",
                description: "Trigger ignores clicks; visual disabled state",
              },
              { name: "confirmLabel", type: "string", description: 'Default "Use selection"' },
              { name: "cancelLabel", type: "string", description: 'Default "Cancel"' },
              { name: "modalClassName", type: "string", description: "Class on the modal panel" },
              { name: "triggerClassName", type: "string", description: "Class on the trigger wrapper span" },
              {
                name: "...rest",
                type: "MediaManagerProps",
                description:
                  "bucketSlug, bucketFilter, showDetailsPane, classNames, etc. forwarded to the inner MediaManager",
              },
            ]}
          />
        </Sub>

        <Callout>
          The modal renders into <InlineCode>document.body</InlineCode> via a React portal, so it escapes parent{" "}
          <InlineCode>overflow:hidden</InlineCode> and transform stacking contexts. Esc closes; backdrop click
          closes; body scroll is locked while open.
        </Callout>
      </Section>

      <Section
        id="lightbox"
        title="Lightbox"
        description="Exported separately so you can use it outside MediaManager (e.g. in a feed view)."
      >
        <CodeBlock
          lang="tsx"
          code={`import { Lightbox } from "@sentroy-co/client-sdk/react"

const [active, setActive] = useState<Media | null>(null)

return (
  <>
    {/* …trigger… */}
    {active && (
      <Lightbox media={active} onClose={() => setActive(null)} />
    )}
  </>
)`}
        />
        <Para>
          Image / video / audio render inline; everything else gets a download button. Esc closes;{" "}
          <InlineCode>onPrev</InlineCode> / <InlineCode>onNext</InlineCode> add ←/→ navigation.
        </Para>
      </Section>

      <Section
        id="helpers"
        title="Helpers"
        description="Tiny utilities re-exported from the React subpath so you don't have to depend on the core SDK package separately."
      >
        <CodeBlock
          lang="ts"
          code={`import {
  cn,           // tiny class joiner
  formatBytes,  // 1234 → "1.21 KB"
  detectKind,   // image | video | audio | pdf | doc | archive | code | other
  matchAccept,  // matchAccept(file, "image/*,.pdf") → boolean
  KIND_LABELS,
  type MediaKind,
} from "@sentroy-co/client-sdk/react"`}
        />

        <Sub title="Requirements">
          <ul className="my-3 list-disc space-y-1 pl-6 text-[14.5px] text-muted-foreground">
            <li>Node.js 18+ (uses native <InlineCode>fetch</InlineCode>)</li>
            <li>React 18+ (only if you import from <InlineCode>/react</InlineCode>)</li>
            <li>Tailwind CSS in the host app (only for React components)</li>
          </ul>
        </Sub>
      </Section>

      <PageFooter current="/docs/react" />
    </article>
  )
}
