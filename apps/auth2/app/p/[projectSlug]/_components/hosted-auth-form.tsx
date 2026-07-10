"use client"

import { useState } from "react"
import type { AuthProjectPasswordPolicy } from "@workspace/db/models/auth-project"

/**
 * Hosted login + signup form — `/p/[slug]/login`, `/p/[slug]/signup`,
 * `/p/[slug]/account` üçünde de kullanılır. Sayfa hangi mod'da olduğunu
 * `initialMode` ile verir; kullanıcı sub-link'le mod değiştirebilir.
 *
 * Token storage: sessionStorage (`sentroyAccessToken_{slug}` /
 * `sentroyRefreshToken_{slug}`) — account-client ile aynı.
 *
 * Login success:
 *   - redirectUri varsa fragment-encoded tokens'la oraya redirect
 *   - Yoksa onLoggedIn callback (parent yönetir, örn. /account'a in-place)
 *
 * MFA: response'ta mfaRequired+mfaToken gelirse 2nd-step form (code veya
 * recovery code) gösterilir.
 *
 * Magic link: requestMagicLink → sayfa "check inbox" mesajına döner.
 *
 * Social: socialGoogleEnabled / socialGithubEnabled true ise anchor
 * butonları render.
 */

interface Props {
  projectSlug: string
  primaryColor: string | null
  initialMode: "login" | "signup"
  magicLinkEnabled: boolean
  socialGoogleEnabled: boolean
  socialGithubEnabled: boolean
  passwordPolicy: AuthProjectPasswordPolicy
  /** Tarayıcıdaki URL'den okunup gelir — login/signup başarılıysa bu
   *  URL'e fragment'ta token'lar ile yönlendirir. Boşsa onLoggedIn'i
   *  çağırır. */
  redirectUri: string | null
  /** redirectUri olmadığında çağrılır. account-client gibi in-place
   *  oturum kurmak için. Login/signup sayfaları boş bırakır (default'ta
   *  /account'a redirect). */
  onLoggedIn?: (accessToken: string, refreshToken: string) => void
  /** Sub-link "Hesap oluştur" / "Giriş yap" arası geçiş. */
  enableSwitchLink?: boolean
}

export function HostedAuthForm({
  projectSlug,
  primaryColor,
  initialMode,
  magicLinkEnabled,
  socialGoogleEnabled,
  socialGithubEnabled,
  passwordPolicy,
  redirectUri,
  onLoggedIn,
  enableSwitchLink = true,
}: Props) {
  const accessKey = `sentroyAccessToken_${projectSlug}`
  const refreshKey = `sentroyRefreshToken_${projectSlug}`

  const [mode, setMode] = useState<"login" | "signup">(initialMode)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // MFA second-factor (login akışında)
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState("")
  const [recoveryCode, setRecoveryCode] = useState("")
  const [useRecovery, setUseRecovery] = useState(false)

  const buttonStyle = primaryColor ? { background: primaryColor } : undefined
  const linkStyle = primaryColor ? { color: primaryColor } : undefined

  function handleSuccess(accessToken: string, refreshToken: string) {
    sessionStorage.setItem(accessKey, accessToken)
    sessionStorage.setItem(refreshKey, refreshToken)
    if (redirectUri) {
      try {
        const url = new URL(redirectUri)
        url.hash = new URLSearchParams({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: "Bearer",
        }).toString()
        window.location.replace(url.toString())
        return
      } catch {
        // invalid uri — fall through
      }
    }
    if (onLoggedIn) {
      onLoggedIn(accessToken, refreshToken)
    } else {
      window.location.href = `/p/${projectSlug}/account`
    }
  }

  async function submitLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/auth/${projectSlug}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, rememberMe }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error_description || j.error || "Sign-in failed.")
        return
      }
      if (j.data?.mfaRequired && j.data?.mfaToken) {
        setMfaToken(j.data.mfaToken)
        return
      }
      handleSuccess(j.data.accessToken, j.data.refreshToken)
    } finally {
      setBusy(false)
    }
  }

  async function submitMfa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!mfaToken) return
    setError(null)
    setBusy(true)
    try {
      const body: Record<string, unknown> = { mfaToken }
      if (useRecovery) body.recoveryCode = recoveryCode.trim()
      else body.code = mfaCode.trim()
      const res = await fetch(`/api/v1/auth/${projectSlug}/login/mfa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error_description || j.error || "Code incorrect.")
        return
      }
      handleSuccess(j.data.accessToken, j.data.refreshToken)
    } finally {
      setBusy(false)
    }
  }

  async function submitSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    if (password.length < passwordPolicy.minLength) {
      setError(`Password must be at least ${passwordPolicy.minLength} characters.`)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/auth/${projectSlug}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error_description || j.error || "Sign-up failed.")
        return
      }
      if (j.data?.emailVerificationRequired) {
        setInfo("Account created. Check your inbox to verify your email.")
        setPassword("")
        setConfirm("")
        return
      }
      // Status 202 (existing account — uniform protection) veya 201 (created)
      if (j.data?.accessToken && j.data?.refreshToken) {
        handleSuccess(j.data.accessToken, j.data.refreshToken)
      } else {
        setInfo(j.data?.message ?? "If the email is available, check your inbox.")
      }
    } finally {
      setBusy(false)
    }
  }

  async function requestMagicLink() {
    if (!email.trim()) {
      setError("Email required for magic link.")
      return
    }
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/auth/${projectSlug}/magic-link/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          redirectUri: redirectUri ?? window.location.href,
        }),
      })
      if (res.ok) {
        setInfo("Check your inbox — a sign-in link has been sent.")
      } else {
        const j = await res.json()
        setError(j.error_description || j.error || "Failed.")
      }
    } finally {
      setBusy(false)
    }
  }

  // MFA 2nd step form
  if (mfaToken) {
    return (
      <form onSubmit={submitMfa} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {useRecovery ? "Recovery code" : "Authenticator code"}
          </label>
          {useRecovery ? (
            <input
              autoFocus
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="xxxx-xxxx"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
            />
          ) : (
            <input
              autoFocus
              inputMode="numeric"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring tracking-widest text-center"
            />
          )}
        </div>
        {error ? (
          <ErrorBlock>{error}</ErrorBlock>
        ) : null}
        <PrimaryButton busy={busy} style={buttonStyle}>
          {busy ? "Verifying…" : "Verify"}
        </PrimaryButton>
        <button
          type="button"
          onClick={() => {
            setUseRecovery((v) => !v)
            setError(null)
          }}
          className="block w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
        >
          {useRecovery ? "Use authenticator code instead" : "Use recovery code instead"}
        </button>
      </form>
    )
  }

  // Signup mode
  if (mode === "signup") {
    return (
      <form onSubmit={submitSignup} className="space-y-4">
        <FieldRow label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </FieldRow>
        <FieldRow label="Display name (optional)">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </FieldRow>
        <FieldRow label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={passwordPolicy.minLength}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            At least {passwordPolicy.minLength} characters
            {passwordPolicy.requireUppercase ? ", uppercase" : ""}
            {passwordPolicy.requireNumber ? ", number" : ""}.
          </p>
        </FieldRow>
        <FieldRow label="Confirm password">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            minLength={passwordPolicy.minLength}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </FieldRow>
        {error ? <ErrorBlock>{error}</ErrorBlock> : null}
        {info ? <InfoBlock>{info}</InfoBlock> : null}
        <PrimaryButton busy={busy} style={buttonStyle}>
          {busy ? "Creating account…" : "Create account"}
        </PrimaryButton>
        {socialGoogleEnabled || socialGithubEnabled ? (
          <SocialButtons
            projectSlug={projectSlug}
            redirectUri={redirectUri}
            googleEnabled={socialGoogleEnabled}
            githubEnabled={socialGithubEnabled}
          />
        ) : null}
        {enableSwitchLink ? (
          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("login")
                setError(null)
                setInfo(null)
              }}
              style={linkStyle}
              className="font-medium underline-offset-2 hover:underline"
            >
              Sign in
            </button>
          </p>
        ) : null}
      </form>
    )
  }

  // Login mode (default)
  return (
    <form onSubmit={submitLogin} className="space-y-4">
      <FieldRow label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </FieldRow>
      <FieldRow label="Password">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </FieldRow>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        Remember me on this device
      </label>
      {error ? <ErrorBlock>{error}</ErrorBlock> : null}
      {info ? <InfoBlock>{info}</InfoBlock> : null}
      <PrimaryButton busy={busy} style={buttonStyle}>
        {busy ? "Signing in…" : "Sign in"}
      </PrimaryButton>
      {magicLinkEnabled ? (
        <button
          type="button"
          onClick={requestMagicLink}
          disabled={busy}
          className="block w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          Email me a sign-in link
        </button>
      ) : null}
      {socialGoogleEnabled || socialGithubEnabled ? (
        <SocialButtons
          projectSlug={projectSlug}
          redirectUri={redirectUri}
          googleEnabled={socialGoogleEnabled}
          githubEnabled={socialGithubEnabled}
        />
      ) : null}
      <div className="space-y-1 text-center text-xs text-muted-foreground">
        <p>
          <a
            href={`/p/${projectSlug}/reset-password`}
            style={linkStyle}
            className="font-medium underline-offset-2 hover:underline"
          >
            Forgot password?
          </a>
        </p>
        {enableSwitchLink ? (
          <p>
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signup")
                setError(null)
                setInfo(null)
              }}
              style={linkStyle}
              className="font-medium underline-offset-2 hover:underline"
            >
              Create one
            </button>
          </p>
        ) : null}
      </div>
    </form>
  )
}

function SocialButtons({
  projectSlug,
  redirectUri,
  googleEnabled,
  githubEnabled,
}: {
  projectSlug: string
  redirectUri: string | null
  googleEnabled: boolean
  githubEnabled: boolean
}) {
  const ru = encodeURIComponent(
    redirectUri ?? (typeof window !== "undefined" ? window.location.href : ""),
  )
  return (
    <div className="flex gap-2">
      {googleEnabled ? (
        <a
          href={`/api/v1/auth/${projectSlug}/social/google/authorize?redirectUri=${ru}`}
          className="flex-1 rounded-md border px-4 py-2 text-center text-sm font-medium hover:bg-muted"
        >
          Continue with Google
        </a>
      ) : null}
      {githubEnabled ? (
        <a
          href={`/api/v1/auth/${projectSlug}/social/github/authorize?redirectUri=${ru}`}
          className="flex-1 rounded-md border px-4 py-2 text-center text-sm font-medium hover:bg-muted"
        >
          Continue with GitHub
        </a>
      ) : null}
    </div>
  )
}

function FieldRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

function ErrorBlock({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </div>
  )
}

function InfoBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
      {children}
    </div>
  )
}

function PrimaryButton({
  busy,
  style,
  children,
}: {
  busy: boolean
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      style={style}
      className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
    >
      {children}
    </button>
  )
}
