import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { TwoFactorForm } from "@workspace/auth/components/two-factor-form"
import { Logo } from "@workspace/console/components/shared"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "profile" })
  return { title: t("twoFactor") }
}

export default function TwoFactorPage() {
  return (
    <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-card/90 p-7 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10">
      <div className="mb-6 flex justify-center">
        <Logo size="md" />
      </div>
      <TwoFactorForm />
    </div>
  )
}
