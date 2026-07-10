import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import { ResetPasswordForm } from "@workspace/auth/components/reset-password-form"
import { Logo } from "@workspace/console/components/shared"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "auth" })
  return { title: t("resetTitle") }
}

/**
 * Reset-password sayfası `?token=...` query'sine bağlı; better-auth'un
 * /reset-password/:token GET callback'i client'ı buraya yönlendirir.
 * Server-side session check yok — token zaten authentication görevini görür.
 */
export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-card/90 p-7 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10">
      <div className="mb-6 flex justify-center">
        <Logo size="md" />
      </div>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
