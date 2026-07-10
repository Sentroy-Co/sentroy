import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { VerifyEmailPending } from "@workspace/auth/components/verify-email-pending"
import { Logo } from "@workspace/console/components/shared"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "auth" })
  return { title: t("verifyPendingTitle") }
}

export default function VerifyEmailPendingPage() {
  return (
    <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-card/90 p-7 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10">
      <div className="mb-6 flex justify-center">
        <Logo size="md" />
      </div>
      <Suspense>
        <VerifyEmailPending />
      </Suspense>
    </div>
  )
}
