import type { LocalizedString } from "@workspace/db/types"

const DEFAULT_LOCALE = "en"

export function t(data: LocalizedString, locale?: string): string {
  if (!data || typeof data !== "object") return ""

  if (locale && data[locale]) return data[locale]

  if (data[DEFAULT_LOCALE]) return data[DEFAULT_LOCALE]

  const firstKey = Object.keys(data)[0]
  return firstKey ? data[firstKey] : ""
}
