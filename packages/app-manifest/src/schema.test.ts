import { describe, expect, it } from "bun:test"
import { parseManifest, manifestSlug, manifestEmbedOrigin, type SentroyAppManifest } from "./index"

const VALID = {
  manifestVersion: 1,
  identity: { id: "resend", name: "Resend", version: "1.4.2", tagline: "Email for developers" },
  appearance: { logoUrl: "https://resend.com/logo.png", color: "#0f0f0f", category: "developer-tools" },
  embed: {
    url: "https://app.resend.com/sentroy",
    injectedParams: ["lang", "fallbackLang", "theme", "companySlug", "token"],
    sandbox: { allowForms: true, allowPopups: false },
    minHeight: 480,
  },
  auth: { mode: "token", jwksAudience: "https://app.resend.com" },
  i18n: { supportedLangs: ["en", "tr", "de"], fallbackLang: "en" },
  store: { description: "Email for developers", privacyUrl: "https://resend.com/privacy" },
  developer: { companySlug: "resend" },
  pricing: { model: "free" },
  capabilities: { requestsUserIdentity: true },
} as const

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(VALID))
}

describe("parseManifest — valid", () => {
  it("accepts a well-formed manifest", () => {
    const r = parseManifest(VALID)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.identity.id).toBe("resend")
      expect(manifestSlug(r.manifest)).toBe("resend")
      expect(manifestEmbedOrigin(r.manifest)).toBe("https://app.resend.com")
    }
  })

  it("accepts a paid app with polar productIds", () => {
    const m = clone()
    m.pricing = { model: "paid", polar: { mode: "production", productIds: ["prod_1"], kind: "subscription" } }
    expect(parseManifest(m).ok).toBe(true)
  })
})

describe("parseManifest — invariants reject", () => {
  it("token mode without jwksAudience", () => {
    const m = clone() as { auth: Record<string, unknown> }
    delete m.auth.jwksAudience
    expect(parseManifest(m).ok).toBe(false)
  })

  it("jwksAudience origin != embed origin", () => {
    const m = clone() as { auth: Record<string, unknown> }
    m.auth.jwksAudience = "https://evil.example.com"
    expect(parseManifest(m).ok).toBe(false)
  })

  it("'token' param but auth.mode none", () => {
    const m = clone() as { auth: Record<string, unknown> }
    m.auth = { mode: "none" }
    expect(parseManifest(m).ok).toBe(false)
  })

  it("fallbackLang not in supportedLangs", () => {
    const m = clone() as { i18n: Record<string, unknown> }
    m.i18n = { supportedLangs: ["en"], fallbackLang: "tr" }
    expect(parseManifest(m).ok).toBe(false)
  })

  it("non-https url", () => {
    const m = clone() as { embed: Record<string, unknown> }
    m.embed = { ...(m.embed as object), url: "http://app.resend.com/sentroy" }
    expect(parseManifest(m).ok).toBe(false)
  })

  it("IP-literal host", () => {
    const m = clone() as { appearance: Record<string, unknown> }
    m.appearance = { ...(m.appearance as object), logoUrl: "https://203.0.113.5/logo.png" }
    expect(parseManifest(m).ok).toBe(false)
  })

  it("reserved id", () => {
    const m = clone() as { identity: Record<string, unknown> }
    m.identity = { ...(m.identity as object), id: "mail" }
    expect(parseManifest(m).ok).toBe(false)
  })

  it("paid without productIds", () => {
    const m = clone()
    ;(m as { pricing: unknown }).pricing = { model: "paid", polar: { mode: "production", productIds: [], kind: "one_time" } }
    expect(parseManifest(m).ok).toBe(false)
  })

  it("extra capability key (forward-guard)", () => {
    const m = clone() as { capabilities: Record<string, unknown> }
    m.capabilities = { requestsUserIdentity: true, readStorage: true }
    expect(parseManifest(m).ok).toBe(false)
  })

  it("manifestVersion above current", () => {
    const m = clone()
    ;(m as { manifestVersion: number }).manifestVersion = 99
    expect(parseManifest(m).ok).toBe(false)
  })

  it("bad semver", () => {
    const m = clone() as { identity: Record<string, unknown> }
    m.identity = { ...(m.identity as object), version: "1.4" }
    expect(parseManifest(m).ok).toBe(false)
  })
})

// tip-seviyesi smoke: inferred tip kullanılabilir olmalı
const _typecheck: SentroyAppManifest | null = null
void _typecheck
