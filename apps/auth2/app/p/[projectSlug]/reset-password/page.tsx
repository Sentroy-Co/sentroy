import { notFound } from "next/navigation"
import { authProjectModel } from "@workspace/db/models"
import { AuthProjectShell } from "../_components/auth-project-shell"
import { ResetPasswordForm } from "./reset-password-form"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Reset password",
}

/**
 * Reset-password landing page. Mail link'inden açılır:
 *   /p/{projectSlug}/reset-password?token={apt_...}
 *
 * Server component branding + token validity check yapar; client form
 * yeni şifreyi POST eder (`/api/v1/auth/[slug]/password-reset/confirm`).
 *
 * Token consume sayfada DEĞİL, form submit'inde confirm endpoint'i
 * tarafından yapılır — kullanıcı sayfayı açıp formu doldurmaya zaman
 * harcayabilir, bu süre içinde token tek-kullanım kaynağı tüketilmez.
 *
 * Eğer token zaten consumed / expired ise sayfa yüklemesinde basit bir
 * "token kontrol" yapılır (consume DEĞİL, sadece varlık ve expiry check)
 * → kötü bir token ile form göstermenin önüne geçer.
 */

interface Props {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ token?: string | string[] }>
}

export default async function ResetPasswordPage({ params, searchParams }: Props) {
  const { projectSlug } = await params
  const sp = await searchParams
  const tokenRaw = sp.token
  const token =
    typeof tokenRaw === "string"
      ? tokenRaw
      : Array.isArray(tokenRaw)
        ? tokenRaw[0]
        : null

  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project) notFound()

  if (!token) {
    return (
      <AuthProjectShell project={project} title="Reset password">
        <p className="text-sm text-center text-muted-foreground">
          No reset token was provided. Please use the link from your email.
        </p>
      </AuthProjectShell>
    )
  }

  // Form'u zaten geçersiz/expired bir token üzerine göstermeyelim —
  // ama consume etmeyelim (form submit'i consume edecek).
  const { authProjectTokenModel } = await import("@workspace/db/models")
  const probe = await authProjectTokenModel.peek(token, "password-reset")
  if (!probe.ok) {
    return (
      <AuthProjectShell project={project} title="Reset password">
        <p className="text-sm text-center text-muted-foreground">
          {probe.reason === "expired"
            ? "This reset link has expired. Request a new one from sign-in."
            : probe.reason === "already-used"
              ? "This link has already been used. Your password may already be reset — try signing in."
              : "This reset link is invalid."}
        </p>
      </AuthProjectShell>
    )
  }

  return (
    <AuthProjectShell project={project} title="Choose a new password">
      <ResetPasswordForm
        projectSlug={project.slug}
        token={token}
        passwordPolicy={project.passwordPolicy}
        primaryColor={project.branding.primaryColor}
      />
    </AuthProjectShell>
  )
}
