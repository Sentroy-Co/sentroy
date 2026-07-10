import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import { CompanySelection } from "@workspace/console/components/company-selection/company-selection"
import { SentroyOS } from "@/components/os/sentroy-os"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  // OS modunda aktif şirket client-side çözülür (URL'de slug yok) → server
  // yalnız temiz marka başlığı verir (absolute → "%s | Sentroy" çift sarmaz),
  // SentroyOS hidrasyondan sonra document.title'ı şirket adına çevirir. Flag
  // kapalıyken klasik şirket-seçim başlığı korunur.
  if (process.env.SENTROY_OS === "1") return { title: { absolute: "Sentroy" } }
  const t = await getTranslations({ locale: lang, namespace: "companySelection" })
  return { title: t("title") }
}

export default async function CompanySelectionPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect(`/${lang}/login`)
  }
  // Sentroy OS — macOS tarzı masaüstü (dock + tab'lı iframe app'leri). Henüz
  // opt-in: SENTROY_OS=1 ile açılır (Faz 2 embed-mode + canlı inceleme sonrası).
  // Kapalıyken mevcut şirket-seçim ekranı korunur (sıfır davranış değişikliği).
  if (process.env.SENTROY_OS !== "1") {
    return <CompanySelection lang={lang} session={session} />
  }
  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  }
  const isAdmin = (session.user as { role?: string }).role === "admin"
  return (
    <SentroyOS lang={lang} user={user} isAdmin={isAdmin} />
  )
}
