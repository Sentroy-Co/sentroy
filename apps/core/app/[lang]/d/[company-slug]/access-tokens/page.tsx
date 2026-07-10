import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { AccessTokensContent } from "@workspace/console/components/access-tokens/access-tokens-content"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "accessTokens" })
  return { title: t("title") }
}

/**
 * Core company Access Tokens sayfası — OS System Settings penceresi `?embed=1`
 * ile iframe eder (mail/storage sidebar'ından kaldırıldı).
 */
export default function AccessTokensPage() {
  return <AccessTokensContent />
}
