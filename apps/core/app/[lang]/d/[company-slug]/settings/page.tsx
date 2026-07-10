import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { SettingsContent } from "@workspace/console/components/settings/settings-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "settings" })
  return { title: t("title") }
}

/**
 * Core company settings page — TeamSwitcher hover'dan veya cross-app
 * yönlendirmesinden gelen kullanıcılar için. Mail/storage subdomain'lerinde
 * de aynı `SettingsContent` render ediliyor; core artık eşdeğer rotaya
 * sahip, "settings butonu çalışmıyor" durumu yok.
 *
 * Üst layout (`company-slug/layout.tsx`) auth + üyelik doğrular.
 */
export default async function SettingsPage() {
  // Genişlik kısıtı SettingsContent içinde (max-w-5xl); burada extra
  // `max-w-3xl` wrapper sayfayı gereksiz daraltıyordu — mail/storage gibi
  // doğrudan render et.
  return <SettingsContent />
}
