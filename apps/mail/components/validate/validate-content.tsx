"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Tick02Icon,
  Cancel01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"

import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

interface ValidationChecks {
  syntax: boolean
  mxExists: boolean
  disposable: boolean
}

interface SingleResult {
  valid: boolean
  email: string
  checks: ValidationChecks
  suggestion?: string
}

interface BatchResult {
  valid: boolean
  email: string
  checks: ValidationChecks
  suggestion?: string
}

/** API farklı shape'lerde dönebildiği için obj'yi normalize eder. */
function normalizeResult(raw: unknown): SingleResult | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  const checks =
    (r.checks as ValidationChecks | undefined) ?? {
      // Eski/alternatif flat shape uyumu
      syntax: Boolean(r.syntaxValid ?? r.syntax ?? false),
      mxExists: Boolean(r.mxFound ?? r.mxExists ?? false),
      disposable: Boolean(r.disposable ?? false),
    }

  return {
    email: String(r.email ?? ""),
    valid: Boolean(r.valid ?? false),
    checks: {
      syntax: Boolean(checks.syntax),
      mxExists: Boolean(checks.mxExists),
      disposable: Boolean(checks.disposable),
    },
    suggestion: typeof r.suggestion === "string" ? r.suggestion : undefined,
  }
}

function CheckIcon({ passed }: { passed: boolean }) {
  return (
    <HugeiconsIcon
      icon={passed ? Tick02Icon : Cancel01Icon}
      strokeWidth={2}
      className={
        passed
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-destructive"
      }
    />
  )
}

export function ValidateContent() {
  const t = useTranslations("validate")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [email, setEmail] = useState("")
  const [singleResult, setSingleResult] = useState<SingleResult | null>(null)
  const [validatingSingle, setValidatingSingle] = useState(false)

  const [batchText, setBatchText] = useState("")
  const [batchResults, setBatchResults] = useState<BatchResult[]>([])
  const [validatingBatch, setValidatingBatch] = useState(false)

  const apiBase = `/api/companies/${slug}/validate`

  async function handleSingleValidate() {
    if (!email.trim()) return

    setValidatingSingle(true)
    setSingleResult(null)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Validation failed")
      }
      setSingleResult(normalizeResult(json.data))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Validation failed"
      toast.error(message)
    } finally {
      setValidatingSingle(false)
    }
  }

  async function handleBatchValidate() {
    const emails = batchText
      .split("\n")
      .map((e) => e.trim())
      .filter((e) => e.length > 0)

    if (emails.length === 0) return

    if (emails.length > 100) {
      toast.error(t("maxBatchError"))
      return
    }

    setValidatingBatch(true)
    setBatchResults([])
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Batch validation failed")
      }
      const rawList = Array.isArray(json.data)
        ? (json.data as unknown[])
        : Array.isArray((json.data as { results?: unknown[] })?.results)
          ? ((json.data as { results: unknown[] }).results)
          : []
      setBatchResults(
        rawList
          .map(normalizeResult)
          .filter((r): r is BatchResult => r !== null),
      )
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Batch validation failed"
      toast.error(message)
    } finally {
      setValidatingBatch(false)
    }
  }

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      <Tabs defaultValue="single">
        <TabsList>
          <TabsTrigger value="single">{t("singleMode")}</TabsTrigger>
          <TabsTrigger value="batch">{t("batchMode")}</TabsTrigger>
        </TabsList>

        {/* Single Email Validation */}
        <TabsContent value="single" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("singleTitle")}
              </CardTitle>
              <CardDescription>{t("singleDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSingleValidate()
                  }}
                  disabled={validatingSingle}
                  className="flex-1"
                />
                <Button
                  onClick={handleSingleValidate}
                  disabled={validatingSingle || !email.trim()}
                >
                  {validatingSingle && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  )}
                  {t("validateButton")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {singleResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("results")}
                </CardTitle>
                <CardDescription>{singleResult.email}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <CheckIcon passed={singleResult.checks.syntax} />
                    <span className="text-sm">{t("syntaxValid")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckIcon passed={singleResult.checks.mxExists} />
                    <span className="text-sm">{t("mxFound")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckIcon passed={!singleResult.checks.disposable} />
                    <span className="text-sm">{t("notDisposable")}</span>
                  </div>
                  {singleResult.suggestion && (
                    <div className="text-sm text-muted-foreground">
                      {t("didYouMean")}{" "}
                      <button
                        type="button"
                        className="font-medium text-primary underline underline-offset-2"
                        onClick={() => setEmail(singleResult.suggestion!)}
                      >
                        {singleResult.suggestion}
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Batch Email Validation */}
        <TabsContent value="batch" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("batchTitle")}
              </CardTitle>
              <CardDescription>{t("batchDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label>{t("emailList")}</Label>
                  <Textarea
                    placeholder={t("batchPlaceholder")}
                    value={batchText}
                    onChange={(e) => setBatchText(e.target.value)}
                    disabled={validatingBatch}
                    rows={6}
                  />
                </div>
                <Button
                  onClick={handleBatchValidate}
                  disabled={validatingBatch || !batchText.trim()}
                  className="self-end"
                >
                  {validatingBatch && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  )}
                  {t("validateAll")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {batchResults.length > 0 && (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("emailColumn")}</TableHead>
                    <TableHead>{t("syntaxValid")}</TableHead>
                    <TableHead>{t("mxFound")}</TableHead>
                    <TableHead>{t("notDisposable")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchResults.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {result.email}
                      </TableCell>
                      <TableCell>
                        <CheckIcon passed={result.checks.syntax} />
                      </TableCell>
                      <TableCell>
                        <CheckIcon passed={result.checks.mxExists} />
                      </TableCell>
                      <TableCell>
                        <CheckIcon passed={!result.checks.disposable} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageTransition>
  )
}
