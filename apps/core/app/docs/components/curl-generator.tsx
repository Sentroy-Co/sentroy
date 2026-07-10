"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import {
  buildCurl,
  buildUrl,
  ENDPOINT_CATALOG,
  type EndpointDef,
  type HttpMethod,
} from "../lib/endpoint-catalog"
import { TOKEN_PLACEHOLDER, useDocsStore } from "../lib/store"
import { CopyButton } from "./copy-button"

const METHOD_TONE: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  POST: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  PUT: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  PATCH: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  DELETE: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
}

const PARAM_REGEX = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g

function extractParams(text: string): string[] {
  const set = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = PARAM_REGEX.exec(text)) !== null) set.add(m[1]!)
  return [...set]
}

function applyParams(text: string, values: Record<string, string>): string {
  return text.replace(PARAM_REGEX, (full, key) => {
    const v = values[key]
    return v && v.trim() ? v.trim() : full
  })
}

const ImportIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3 11v2h10v-2" />
    <path d="M8 2v8" />
    <polyline points="5 7 8 10 11 7" />
  </svg>
)

export function CurlGenerator() {
  const token = useDocsStore((s) => s.token)
  const slug = useDocsStore((s) => s.companySlug)
  const generatorBody = useDocsStore((s) => s.generatorBody)
  const setGeneratorBody = useDocsStore((s) => s.setGeneratorBody)

  const [endpointId, setEndpointId] = useState<string>(ENDPOINT_CATALOG[0]!.id)
  const endpoint = useMemo(
    () => ENDPOINT_CATALOG.find((e) => e.id === endpointId) ?? ENDPOINT_CATALOG[0]!,
    [endpointId],
  )

  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [body, setBody] = useState<string>(endpoint.body ?? "")

  // Reset body + params when the endpoint changes; keep store body if the
  // user manually edited it for the same endpoint.
  useEffect(() => {
    setBody(endpoint.body ?? "")
    setParamValues({})
  }, [endpoint])

  const importStored = () => {
    if (generatorBody) setBody(generatorBody)
  }

  const params = useMemo(
    () => extractParams(`${endpoint.path} ${endpoint.body ?? ""}`),
    [endpoint],
  )

  const finalUrl = useMemo(() => {
    const filledPath = applyParams(endpoint.path, paramValues)
    return buildUrl({ ...endpoint, path: filledPath }, slug)
  }, [endpoint, paramValues, slug])

  const finalBody = useMemo(
    () => (body ? applyParams(body, paramValues) : ""),
    [body, paramValues],
  )

  const curl = useMemo(
    () =>
      buildCurl({
        method: endpoint.method,
        url: finalUrl,
        token: token || TOKEN_PLACEHOLDER,
        body: endpoint.method === "GET" ? null : finalBody,
      }),
    [endpoint.method, finalUrl, finalBody, token],
  )

  return (
    <div className="space-y-5">
      {/* Endpoint picker */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Select
          value={endpointId}
          onValueChange={(v) => v && setEndpointId(v)}
        >
          <SelectTrigger className="rounded-md font-mono text-[12.5px]">
            <span className="flex items-center gap-2 truncate">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  METHOD_TONE[endpoint.method],
                )}
              >
                {endpoint.method}
              </span>
              <span className="truncate text-foreground">{endpoint.label}</span>
            </span>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(
              ENDPOINT_CATALOG.reduce<Record<string, EndpointDef[]>>((acc, e) => {
                if (!acc[e.group]) acc[e.group] = []
                acc[e.group]!.push(e)
                return acc
              }, {}),
            ).map(([group, items]) => (
              <div key={group}>
                <div className="px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </div>
                {items.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider",
                          METHOD_TONE[e.method],
                        )}
                      >
                        {e.method}
                      </span>
                      <span>{e.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* URL preview */}
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div className="mb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Request URL
        </div>
        <div className="overflow-x-auto whitespace-pre font-mono text-[12.5px] text-foreground">
          {finalUrl}
        </div>
        {endpoint.description ? (
          <div className="mt-2 text-[12.5px] text-muted-foreground">
            {endpoint.description}
          </div>
        ) : null}
      </div>

      {/* Path param inputs */}
      {params.length > 0 ? (
        <div>
          <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Parameters
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {params.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-[12px] text-muted-foreground">
                  {`{${p}}`}
                </span>
                <Input
                  value={paramValues[p] ?? ""}
                  onChange={(e) =>
                    setParamValues((v) => ({ ...v, [p]: e.target.value }))
                  }
                  placeholder={p}
                  className="h-8 rounded-md font-mono text-[12px]"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Body editor */}
      {endpoint.method !== "GET" ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Request body (JSON)
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setGeneratorBody(body)}
                disabled={!body}
                className="h-7 px-2 text-[11.5px]"
              >
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={importStored}
                disabled={!generatorBody}
                className="h-7 gap-1.5 px-2 text-[11.5px]"
              >
                <ImportIcon className="size-3" />
                Import saved
              </Button>
            </div>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            rows={Math.max(6, body.split("\n").length + 1)}
            className="w-full rounded-md border border-border bg-muted/40 p-3 font-mono text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
      ) : null}

      {/* Output */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Generated cURL
          </div>
          {!token ? (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              Using placeholder token — set yours in Credentials.
            </span>
          ) : null}
        </div>
        <div className="group relative overflow-hidden rounded-lg border border-border bg-[var(--shiki-bg)]">
          <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-foreground">
            {curl}
          </pre>
          <CopyButton text={curl} />
        </div>
      </div>
    </div>
  )
}
