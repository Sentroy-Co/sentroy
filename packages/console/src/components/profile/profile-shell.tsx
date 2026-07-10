"use client"

import { useTranslations } from "next-intl"
import { useParams } from "next/navigation"
import { signOutAndRedirectToCore } from "@workspace/auth/client/auth-client"
import { Logo } from "@workspace/console/components/shared"

/**
 * Profil sayfaları için ortak shell — sticky navbar (sol Sentroy logo, sağ
 * mode-aware CTA'lar) + main slot + minimal footer. Hem public ziyaretçi
 * sayfası (`/profile/u/{slug}`) hem de kullanıcının kendi düzenleme
 * sayfası (`/profile`) bunu kullanır; mode'a göre üst sağ butonlar değişir.
 *
 * Mode davranışı:
 *  - `public`  → "Sign in" + "Get started" CTA'ları (anonymous ziyaretçi).
 *  - `owner`   → "View public profile" (varsa) + "Sign out" (authenticated).
 *
 * Footer her iki modda da aynı: copyright + slug mono + Home/Sign in linkleri.
 */

export interface ProfileShellProps {
  mode: "public" | "owner"
  /**
   * Owner mode'da kullanıcının kendi public profile slug'ı — varsa
   * "View public profile" linki gösterir, yoksa gizler. Public mode'da
   * footer'da gösterilen `/profile/u/{slug}` mono için kullanılır.
   */
  slug?: string | null
  children: React.ReactNode
}

export function ProfileShell({ mode, slug, children }: ProfileShellProps) {
  const t = useTranslations("publicProfile")
  const params = useParams<{ lang?: string }>()
  const lang = params?.lang ?? "en"

  /**
   * better-auth'ın `/api/auth/sign-out` endpoint'i POST + CSRF token
   * bekliyor; `<a href>` GET çağrısı 405/CSRF ile reddediliyor. signOut
   * + cross-subdomain core login redirect tek helper'da:
   * `signOutAndRedirectToCore` (sub-app'lerden de doğru çalışır).
   */
  const handleSignOut = () => {
    void signOutAndRedirectToCore(lang)
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header data-app-chrome className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4">
          <a href="/" className="inline-flex items-center gap-2">
            <Logo size="sm" />
          </a>
          <nav className="flex items-center gap-2 text-xs">
            {mode === "public" ? (
              <>
                <a
                  href="/login"
                  className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  {t("signIn")}
                </a>
                <a
                  href="/login"
                  className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background transition-opacity hover:opacity-90"
                >
                  {t("getStarted")}
                </a>
              </>
            ) : (
              <>
                {slug && (
                  <a
                    href={`/profile/u/${slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    {t("viewPublic")}
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background transition-opacity hover:opacity-90"
                >
                  {t("signOut")}
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ── Content slot ────────────────────────────────────────────────── */}
      <main className="flex-1">{children}</main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer data-app-chrome className="border-t bg-muted/20">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-2 px-4 py-5 text-[11px] text-muted-foreground sm:flex-row">
          <span>
            © {new Date().getFullYear()} Sentroy
            {slug && (
              <>
                {" · "}
                <span className="font-mono">/profile/u/{slug}</span>
              </>
            )}
          </span>
          <div className="flex items-center gap-3">
            <a href="/" className="hover:text-foreground">
              {t("home")}
            </a>
            <a href="/login" className="hover:text-foreground">
              {t("signIn")}
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
