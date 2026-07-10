export const LANDING_SECTION_IDS = [
  "logos",
  "security",
  "apps",
  "features",
  "zsections",
  "metrics",
  "testimonials",
  "pricing",
  "sdk",
  "faq",
  "finalCta",
  "newsletter",
] as const

export type LandingSectionId = (typeof LANDING_SECTION_IDS)[number]

export const DEFAULT_LANDING_SECTION_ORDER: LandingSectionId[] = [
  ...LANDING_SECTION_IDS,
]

export const LANDING_SECTION_LABELS: Record<
  LandingSectionId,
  { label: string; description: string; toggleKey?: string }
> = {
  logos: {
    label: "Customer logos",
    description: "Social proof logo marquee.",
    toggleKey: "showLogos",
  },
  security: {
    label: "Security strip",
    description: "Always-on trust and compliance row.",
  },
  apps: {
    label: "Apps",
    description: "Product cards for Sentroy apps.",
    toggleKey: "showApps",
  },
  features: {
    label: "Features",
    description: "Core platform feature grid.",
  },
  zsections: {
    label: "Z-Sections",
    description: "Problem, solution and result blocks.",
    toggleKey: "showZSections",
  },
  metrics: {
    label: "Metrics",
    description: "Delivery analytics chart section.",
    toggleKey: "showMetrics",
  },
  testimonials: {
    label: "Testimonials",
    description: "Customer quote marquee.",
    toggleKey: "showTestimonials",
  },
  pricing: {
    label: "Pricing",
    description: "Public pricing cards.",
    toggleKey: "showPricing",
  },
  sdk: {
    label: "SDK",
    description: "Developer code examples.",
  },
  faq: {
    label: "FAQ",
    description: "Frequently asked questions.",
  },
  finalCta: {
    label: "Final CTA",
    description: "Signup call to action.",
  },
  newsletter: {
    label: "Newsletter",
    description: "Newsletter signup block.",
  },
}

const SECTION_ID_SET = new Set<string>(LANDING_SECTION_IDS)

export function isLandingSectionId(value: unknown): value is LandingSectionId {
  return typeof value === "string" && SECTION_ID_SET.has(value)
}

export function normalizeLandingSectionOrder(
  value: unknown
): LandingSectionId[] {
  const incoming = Array.isArray(value) ? value : []
  const seen = new Set<LandingSectionId>()
  const normalized: LandingSectionId[] = []

  for (const item of incoming) {
    if (!isLandingSectionId(item) || seen.has(item)) continue
    seen.add(item)
    normalized.push(item)
  }

  for (const id of DEFAULT_LANDING_SECTION_ORDER) {
    if (seen.has(id)) continue
    normalized.push(id)
  }

  return normalized
}
