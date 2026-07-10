import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import { companyModel } from "@workspace/db/models"
import { AppPickerContent } from "@/components/app-picker/app-picker-content"
import { SentroyOS } from "@/components/os/sentroy-os"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; "company-slug": string }>
}): Promise<Metadata> {
  const { lang, "company-slug": slug } = await params
  // OS modunda sekme başlığı = şirket adı (absolute → "%s | Sentroy" sarmaz).
  if (process.env.SENTROY_OS === "1") {
    const company = await companyModel.findBySlug(slug.toLowerCase())
    return { title: { absolute: company?.name ?? "Sentroy" } }
  }
  const t = await getTranslations({ locale: lang, namespace: "appPicker" })
  return { title: t("title") }
}

export default async function AppPickerPage({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { lang, "company-slug": slug } = await params

  // Sentroy OS — şirket URL'inden de açılır (o şirket aktif). Flag kapalıyken
  // klasik dashboard anasayfası (AppPickerContent). OS `fixed inset-0` olduğu
  // için dashboard shell'in üstünü kaplar.
  if (process.env.SENTROY_OS !== "1") {
    return <AppPickerContent />
  }
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect(`/${lang}/login`)
  }
  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  }
  const isAdmin = (session.user as { role?: string }).role === "admin"
  return (
    <SentroyOS
      lang={lang}
      user={user}
      isAdmin={isAdmin}
      initialCompanySlug={slug}
    />
  )
}
