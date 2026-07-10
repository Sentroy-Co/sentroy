"use client"

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"

/**
 * DNS checker — DNS-over-HTTPS (Google `dns.google/resolve`, CORS açık) ile
 * client-side sorgu. Sunucu gerekmez. A/AAAA/MX/TXT/CNAME/NS/SOA.
 */

const TYPES = ["A", "AAAA", "MX", "TXT", "CNAME", "NS", "SOA"]

interface Answer {
  name: string
  TTL: number
  data: string
}

export function DnsCheckerTool() {
  const t = useTranslations("d")
  const [domain, setDomain] = useState("")
  const [type, setType] = useState("A")
  const [answers, setAnswers] = useState<Answer[] | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const lookup = useCallback(
    async (recordType: string) => {
      const name = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
      if (!name) return
      setType(recordType)
      setLoading(true)
      setStatus(null)
      try {
        const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${recordType}`)
        const json = (await res.json()) as { Status: number; Answer?: Answer[] }
        if (json.Status === 3) {
          setAnswers([])
          setStatus(t("dnsNxdomain"))
        } else if (json.Status !== 0) {
          setAnswers([])
          setStatus(t("dnsError"))
        } else {
          setAnswers(json.Answer ?? [])
          setStatus(null)
        }
      } catch {
        setAnswers([])
        setStatus(t("dnsError"))
      } finally {
        setLoading(false)
      }
    },
    [domain, t],
  )

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup(type)}
          placeholder="sentroy.com"
          spellCheck={false}
          className="h-11 flex-1 rounded-xl border bg-card px-4 font-mono text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => lookup(type)}
          disabled={loading || !domain.trim()}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-5" />
          {t("dnsLookup")}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((ty) => (
          <button
            key={ty}
            onClick={() => lookup(ty)}
            disabled={!domain.trim()}
            className={
              "rounded-full px-3 py-1.5 font-mono text-xs transition-colors disabled:opacity-40 " +
              (type === ty ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
            }
          >
            {ty}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("dnsLooking")}
          </motion.div>
        ) : answers === null ? (
          <motion.div key="e" className="rounded-2xl border border-dashed bg-card/50 p-8 text-center text-sm text-muted-foreground/60">
            {t("dnsHint")}
          </motion.div>
        ) : answers.length === 0 ? (
          <motion.div key="0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {status ?? t("dnsNoRecords", { type })}
          </motion.div>
        ) : (
          <motion.div key="r" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start font-semibold">{t("dnsName")}</th>
                  <th className="w-20 px-4 py-2 text-start font-semibold">TTL</th>
                  <th className="px-4 py-2 text-start font-semibold">{t("dnsData")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {answers.map((a, i) => (
                  <tr key={i} className="font-mono text-xs">
                    <td className="px-4 py-2.5 text-muted-foreground">{a.name}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground/70">{a.TTL}</td>
                    <td className="break-all px-4 py-2.5">{a.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
