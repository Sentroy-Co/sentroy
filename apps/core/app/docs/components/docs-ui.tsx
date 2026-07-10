import { cn } from "@workspace/ui/lib/utils"

type SectionProps = {
  id: string
  title: string
  eyebrow?: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Section({ id, title, eyebrow, description, children, className }: SectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-24 border-t border-border pt-12 first:border-t-0 first:pt-0", className)}>
      {eyebrow ? (
        <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </div>
      ) : null}
      {/* Sticky on scroll: the active section's heading pins just under the
          64px top app bar (top-16) with a blurred backdrop, then the next
          section's heading pushes it up. */}
      <h2 className="group/heading sticky top-16 z-[5] -mx-1 scroll-mt-24 bg-background/85 px-1 py-2 text-2xl font-semibold tracking-tight text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/65">
        <a href={`#${id}`} className="inline-flex items-baseline gap-2 hover:no-underline">
          <span>{title}</span>
          <span className="text-muted-foreground/40 opacity-0 transition group-hover/heading:opacity-100">#</span>
        </a>
      </h2>
      {description ? (
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  )
}

export function Sub({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="mt-10 scroll-mt-24">
      <h3 className="group/h3 text-base font-semibold tracking-tight text-foreground">
        {id ? (
          <a href={`#${id}`} className="inline-flex items-baseline gap-2 hover:no-underline">
            <span>{title}</span>
            <span className="text-muted-foreground/40 opacity-0 transition group-hover/h3:opacity-100">#</span>
          </a>
        ) : (
          title
        )}
      </h3>
      <div className="mt-3">{children}</div>
    </div>
  )
}

type CalloutProps = {
  variant?: "info" | "warning" | "success"
  title?: string
  children: React.ReactNode
}

export function Callout({ variant = "info", title, children }: CalloutProps) {
  const tone = {
    info: "border-l-blue-500 bg-blue-500/[0.06] text-foreground",
    warning: "border-l-amber-500 bg-amber-500/[0.06] text-foreground",
    success: "border-l-emerald-500 bg-emerald-500/[0.06] text-foreground",
  }[variant]
  return (
    <aside className={cn("my-5 rounded-r-lg border border-border border-l-[3px] p-4 text-sm leading-relaxed", tone)}>
      {title ? <div className="mb-1 font-semibold">{title}</div> : null}
      <div className="text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </aside>
  )
}

const METHOD_TONE: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  POST: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  PUT: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  PATCH: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  DELETE: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
}

export function Endpoint({ method, path }: { method: keyof typeof METHOD_TONE; path: string }) {
  return (
    <div className="my-4 flex items-center gap-3 overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-mono text-[13px]">
      <span className={cn("rounded px-2 py-0.5 text-[10.5px] font-bold tracking-wider", METHOD_TONE[method])}>
        {method}
      </span>
      <code className="text-foreground">{path}</code>
    </div>
  )
}

type PropsTableRow = {
  name: string
  type: string
  required?: boolean
  description: React.ReactNode
}

export function PropsTable({ rows }: { rows: PropsTableRow[] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-muted/40">
          <tr className="border-b border-border">
            <th className="px-4 py-2.5 font-semibold">Name</th>
            <th className="px-4 py-2.5 font-semibold">Type</th>
            <th className="px-4 py-2.5 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-border/60 last:border-b-0 align-top">
              <td className="px-4 py-3 font-mono text-[12.5px]">
                <span className="text-foreground">{r.name}</span>
                {r.required ? (
                  <span className="ml-2 rounded bg-rose-500/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                    required
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 font-mono text-[12.5px] text-muted-foreground">{r.type}</td>
              <td className="px-4 py-3 text-[13.5px] text-muted-foreground">{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Lede({ children }: { children: React.ReactNode }) {
  return <p className="text-[17px] leading-relaxed text-muted-foreground">{children}</p>
}

export function Para({ children }: { children: React.ReactNode }) {
  return <p className="my-4 text-[15px] leading-relaxed text-muted-foreground">{children}</p>
}
