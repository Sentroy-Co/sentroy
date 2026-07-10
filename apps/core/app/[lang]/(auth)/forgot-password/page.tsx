import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import { ForgotPasswordForm } from "@workspace/auth/components/forgot-password-form"
import { Logo } from "@workspace/console/components/shared"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "auth" })
  return { title: t("forgotTitle") }
}

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) redirect(`/${lang}/d`)

  return (
    <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-card/90 p-7 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10">
      <div className="mb-6 flex justify-center">
        <Logo size="md" />
      </div>
      <ForgotPasswordForm />
    </div>
  )
}
