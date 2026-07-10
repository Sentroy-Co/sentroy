import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { isDbInitialized } from "@/lib/seed-runner"
import { SetupWizard } from "@/components/setup/setup-wizard"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "setup" })
  return { title: t("title") }
}

/**
 * First-run setup wizard — DB boşken kullanıcıyı buraya yönlendiriyoruz
 * (login sayfası check yapıyor). Bir kez initialize olduktan sonra bu
 * sayfa /login'e yönlendirir.
 */
export default async function SetupPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  let initialized = false
  try {
    const status = await isDbInitialized()
    initialized = status.initialized
  } catch {
    // DB hiç ulaşılamıyor → user'ı setup'ta tutalım, hata mesajı gösterir
    initialized = false
  }
  if (initialized) {
    redirect(`/${lang}/login`)
  }
  return <SetupWizard lang={lang} />
}
