import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import { LoginForm } from "@workspace/auth/components/login-form"
import { Logo } from "@workspace/console/components/shared"
import { isDbInitialized } from "@/lib/seed-runner"

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "auth" })
  return { title: t("login") }
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params

  // First-run guard — DB hiç kurulmamışsa setup wizard'a yönlendir.
  // Hata durumunda (mongo down) login formu yine açılır; admin sorunu
  // tanılamak istesin diye bypass.
  try {
    const status = await isDbInitialized()
    if (!status.initialized) {
      redirect(`/${lang}/setup`)
    }
  } catch {
    // mongo unreachable — login form açık kalsın, hata mesajı login'de gözükür
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (session) {
    redirect(`/${lang}/d`)
  }

  return (
    <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-card/90 p-7 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10">
      <div className="mb-6 flex justify-center">
        <Logo size="md" />
      </div>
      <LoginForm />
    </div>
  )
}
