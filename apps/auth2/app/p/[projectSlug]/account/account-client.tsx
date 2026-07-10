"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Hosted account management — sessionStorage'a koyulan access token
 * üzerinden çalışır. Token yoksa login form, varsa 4 tab.
 *
 * sessionStorage key: `sentroyAccessToken_{projectSlug}` ve
 * `sentroyRefreshToken_{projectSlug}`. Refresh için ayrı flow yok;
 * access expire ederse kullanıcı tekrar login (15dk window genellikle
 * yeterli account management için).
 */

interface User {
  id: string
  email: string
  emailVerified: boolean
  displayName: string | null
  image: string | null
}

interface Session {
  id: string
  refreshTokenPrefix: string
  userAgent: string | null
  ip: string | null
  expiresAt: string
  createdAt: string
}

interface Passkey {
  id: string
  credentialIdPrefix: string
  deviceName: string | null
  transports: string[]
  lastUsedAt: string | null
  createdAt: string
}

interface MfaStatus {
  enrolled: boolean
  factorType?: "totp"
  verifiedAt?: string | null
  recoveryCodesRemaining?: number
}

type Tab = "profile" | "sessions" | "mfa" | "danger"

interface Props {
  projectSlug: string
  projectName: string
  primaryColor: string | null
  magicLinkEnabled: boolean
  socialGoogleEnabled: boolean
  socialGithubEnabled: boolean
}

export function AccountClient({
  projectSlug,
  projectName,
  primaryColor,
  magicLinkEnabled,
  socialGoogleEnabled,
  socialGithubEnabled,
}: Props) {
  const accessKey = `sentroyAccessToken_${projectSlug}`
  const refreshKey = `sentroyRefreshToken_${projectSlug}`

  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>("profile")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Initial: pick up token from sessionStorage
  useEffect(() => {
    const t = sessionStorage.getItem(accessKey)
    if (t) setToken(t)
  }, [accessKey])

  // Fetch /me when token set
  useEffect(() => {
    if (!token) return
    fetch(`/api/v1/auth/${projectSlug}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json().then((j) => ({ status: r.status, j })))
      .then(({ status, j }) => {
        if (status === 200) setUser(j.data)
        else {
          // Token invalid / expired → clear and prompt re-auth
          sessionStorage.removeItem(accessKey)
          sessionStorage.removeItem(refreshKey)
          setToken(null)
          setError(j.error_description ?? "Session expired, sign in again.")
        }
      })
      .catch(() => {
        setError("Network error.")
      })
  }, [token, projectSlug, accessKey, refreshKey])

  function handleLoggedIn(accessToken: string, refreshToken: string) {
    sessionStorage.setItem(accessKey, accessToken)
    sessionStorage.setItem(refreshKey, refreshToken)
    setToken(accessToken)
    setInfo(null)
    setError(null)
  }

  function logout() {
    sessionStorage.removeItem(accessKey)
    sessionStorage.removeItem(refreshKey)
    setToken(null)
    setUser(null)
  }

  if (!token || !user) {
    return (
      <LoginForm
        projectSlug={projectSlug}
        primaryColor={primaryColor}
        magicLinkEnabled={magicLinkEnabled}
        socialGoogleEnabled={socialGoogleEnabled}
        socialGithubEnabled={socialGithubEnabled}
        initialError={error}
        onLoggedIn={handleLoggedIn}
        onInfo={setInfo}
        info={info}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {user.displayName || user.email}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {user.email}
            {user.emailVerified ? " · verified" : " · unverified"}
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-md border px-3 py-1 text-[11px] hover:bg-muted"
        >
          Sign out
        </button>
      </div>

      <div className="flex gap-1 border-b text-xs">
        {(["profile", "sessions", "mfa", "danger"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setTab(opt)}
            className={`-mb-px px-3 py-2 border-b-2 transition ${
              tab === opt
                ? "border-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            style={tab === opt && primaryColor ? { borderColor: primaryColor, color: primaryColor } : undefined}
          >
            {opt === "profile"
              ? "Profile"
              : opt === "sessions"
                ? "Sessions"
                : opt === "mfa"
                  ? "Two-factor"
                  : "Danger zone"}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <ProfileTab
          projectSlug={projectSlug}
          token={token}
          primaryColor={primaryColor}
          user={user}
          onUserUpdated={setUser}
        />
      ) : null}
      {tab === "sessions" ? (
        <SessionsTab projectSlug={projectSlug} token={token} />
      ) : null}
      {tab === "mfa" ? (
        <MfaTab projectSlug={projectSlug} token={token} primaryColor={primaryColor} projectName={projectName} />
      ) : null}
      {tab === "danger" ? (
        <DangerTab projectSlug={projectSlug} token={token} onDeleted={logout} primaryColor={primaryColor} />
      ) : null}
    </div>
  )
}

// ─── Login form ───────────────────────────────────────────────────────────

function LoginForm({
  projectSlug,
  primaryColor,
  magicLinkEnabled,
  socialGoogleEnabled,
  socialGithubEnabled,
  initialError,
  onLoggedIn,
  onInfo,
  info,
}: {
  projectSlug: string
  primaryColor: string | null
  magicLinkEnabled: boolean
  socialGoogleEnabled: boolean
  socialGithubEnabled: boolean
  initialError: string | null
  onLoggedIn: (accessToken: string, refreshToken: string) => void
  onInfo: (s: string | null) => void
  info: string | null
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [busy, setBusy] = useState(false)

  // MFA second-factor state
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState("")
  const [recoveryCode, setRecoveryCode] = useState("")
  const [useRecovery, setUseRecovery] = useState(false)

  const buttonStyle = primaryColor ? { background: primaryColor } : undefined

  async function submitPassword(e: React.FormEvent<HTMLFormElement>) {
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
      onLoggedIn(j.data.accessToken, j.data.refreshToken)
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
      onLoggedIn(j.data.accessToken, j.data.refreshToken)
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
          redirectUri: window.location.href,
        }),
      })
      if (res.ok) {
        onInfo("Check your inbox — a sign-in link has been sent.")
      } else {
        const j = await res.json()
        setError(j.error_description || j.error || "Failed.")
      }
    } finally {
      setBusy(false)
    }
  }

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
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          style={buttonStyle}
          className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Verifying…" : "Verify"}
        </button>
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

  return (
    <form onSubmit={submitPassword} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        Remember me on this device
      </label>
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {info}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        style={buttonStyle}
        className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
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
        <div className="flex gap-2">
          {socialGoogleEnabled ? (
            <a
              href={`/api/v1/auth/${projectSlug}/social/google/authorize?redirectUri=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
              className="flex-1 rounded-md border px-4 py-2 text-center text-sm font-medium hover:bg-muted"
            >
              Google
            </a>
          ) : null}
          {socialGithubEnabled ? (
            <a
              href={`/api/v1/auth/${projectSlug}/social/github/authorize?redirectUri=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
              className="flex-1 rounded-md border px-4 py-2 text-center text-sm font-medium hover:bg-muted"
            >
              GitHub
            </a>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

// ─── Profile tab ──────────────────────────────────────────────────────────

function ProfileTab({
  projectSlug,
  token,
  primaryColor,
  user,
  onUserUpdated,
}: {
  projectSlug: string
  token: string
  primaryColor: string | null
  user: User
  onUserUpdated: (u: User) => void
}) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [emailPassword, setEmailPassword] = useState("")
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const buttonStyle = primaryColor ? { background: primaryColor } : undefined

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    if (newPassword !== confirm) {
      setMsg({ kind: "err", text: "New passwords don't match." })
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/auth/${projectSlug}/me/password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const j = await res.json()
      if (!res.ok) {
        setMsg({ kind: "err", text: j.error_description || j.error || "Failed." })
        return
      }
      setMsg({
        kind: "ok",
        text: "Password updated. All other sessions have been signed out.",
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirm("")
    } finally {
      setBusy(false)
    }
  }

  async function changeEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/auth/${projectSlug}/me/email/change-request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, currentPassword: emailPassword }),
      })
      const j = await res.json()
      if (!res.ok) {
        setMsg({ kind: "err", text: j.error_description || j.error || "Failed." })
        return
      }
      setMsg({
        kind: "ok",
        text: `Confirmation sent to ${newEmail}. Click the link to finalize the change.`,
      })
      setNewEmail("")
      setEmailPassword("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border p-4">
        <h3 className="mb-3 text-sm font-semibold">Change password</h3>
        <form onSubmit={changePassword} className="space-y-3">
          <Field label="Current password">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <button
            type="submit"
            disabled={busy}
            style={buttonStyle}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>

      <div className="rounded-md border p-4">
        <h3 className="mb-3 text-sm font-semibold">Change email</h3>
        <form onSubmit={changeEmail} className="space-y-3">
          <Field label="New email">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Current password">
            <input
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <p className="text-[11px] text-muted-foreground">
            We'll send a confirmation to the new address.
          </p>
          <button
            type="submit"
            disabled={busy}
            style={buttonStyle}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send confirmation"}
          </button>
        </form>
      </div>

      {msg ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${msg.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  )
}

// ─── Sessions tab ─────────────────────────────────────────────────────────

function SessionsTab({ projectSlug, token }: { projectSlug: string; token: string }) {
  const [items, setItems] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/auth/${projectSlug}/me/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await res.json()
      setItems(j.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [projectSlug, token])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function revoke(id: string) {
    const res = await fetch(`/api/v1/auth/${projectSlug}/me/sessions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) fetchAll()
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">No active sessions.</p>

  return (
    <div className="overflow-hidden rounded-md border">
      {items.map((s, i) => (
        <div
          key={s.id}
          className={`flex items-start justify-between gap-2 px-3 py-2 text-xs ${i > 0 ? "border-t" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{s.userAgent ?? "Unknown device"}</div>
            <div className="text-[10px] text-muted-foreground">
              {s.ip ?? "—"} · refresh {s.refreshTokenPrefix}… · {new Date(s.createdAt).toLocaleString()}
            </div>
          </div>
          <button
            type="button"
            onClick={() => revoke(s.id)}
            className="rounded-md border px-2 py-1 text-[10px] hover:bg-muted"
          >
            Revoke
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── MFA + passkey tab ────────────────────────────────────────────────────

function MfaTab({
  projectSlug,
  token,
  primaryColor,
  projectName,
}: {
  projectSlug: string
  token: string
  primaryColor: string | null
  projectName: string
}) {
  const [mfa, setMfa] = useState<MfaStatus | null>(null)
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null)
  const [enrollCode, setEnrollCode] = useState("")
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [disablePwd, setDisablePwd] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const buttonStyle = primaryColor ? { background: primaryColor } : undefined

  const fetchAll = useCallback(async () => {
    try {
      const [mfaRes, pkRes] = await Promise.all([
        fetch(`/api/v1/auth/${projectSlug}/me/mfa`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/v1/auth/${projectSlug}/me/passkey`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      setMfa((await mfaRes.json()).data)
      setPasskeys((await pkRes.json()).data ?? [])
    } catch {
      // ignore
    }
  }, [projectSlug, token])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function startEnroll() {
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/auth/${projectSlug}/me/mfa/totp/enroll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await res.json()
      if (res.ok) setOtpauthUri(j.data.otpauthUri)
      else setMsg(j.error_description || "Could not start enrollment.")
    } finally {
      setBusy(false)
    }
  }

  async function verifyEnroll(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch(
        `/api/v1/auth/${projectSlug}/me/mfa/totp/verify-enrollment`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ code: enrollCode.trim() }),
        },
      )
      const j = await res.json()
      if (res.ok) {
        setRecoveryCodes(j.data.recoveryCodes)
        setOtpauthUri(null)
        setEnrollCode("")
        fetchAll()
      } else {
        setMsg(j.error_description || "Code incorrect.")
      }
    } finally {
      setBusy(false)
    }
  }

  async function disableMfa() {
    if (!disablePwd) return
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/auth/${projectSlug}/me/mfa/totp/disable`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: disablePwd }),
      })
      const j = await res.json()
      if (res.ok) {
        setMsg("Two-factor disabled.")
        setDisablePwd("")
        fetchAll()
      } else {
        setMsg(j.error_description || "Failed.")
      }
    } finally {
      setBusy(false)
    }
  }

  async function registerPasskey() {
    setMsg(null)
    setBusy(true)
    try {
      const beginRes = await fetch(
        `/api/v1/auth/${projectSlug}/me/passkey/register/begin`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      const beginJson = await beginRes.json()
      if (!beginRes.ok) {
        setMsg(beginJson.error_description || "Failed to begin.")
        return
      }
      const { startRegistration } = await import("@simplewebauthn/browser")
      const attestation = await startRegistration({
        optionsJSON: beginJson.data.options,
      })
      const completeRes = await fetch(
        `/api/v1/auth/${projectSlug}/me/passkey/register/complete`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeToken: beginJson.data.challengeToken,
            response: attestation,
            deviceName: navigator.userAgent.slice(0, 80),
          }),
        },
      )
      const completeJson = await completeRes.json()
      if (completeRes.ok) {
        setMsg("Passkey registered.")
        fetchAll()
      } else {
        setMsg(completeJson.error_description || "Registration failed.")
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Passkey registration failed.")
    } finally {
      setBusy(false)
    }
  }

  async function removePasskey(id: string) {
    const res = await fetch(`/api/v1/auth/${projectSlug}/me/passkey/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) fetchAll()
  }

  return (
    <div className="space-y-6">
      {/* TOTP */}
      <div className="rounded-md border p-4">
        <h3 className="mb-3 text-sm font-semibold">
          Authenticator app (TOTP)
        </h3>
        {!mfa?.enrolled && !otpauthUri ? (
          <button
            type="button"
            onClick={startEnroll}
            disabled={busy}
            style={buttonStyle}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            Enable two-factor
          </button>
        ) : null}
        {otpauthUri ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Scan this URI with your authenticator app (Google Authenticator, 1Password, Authy):
            </p>
            <code className="block break-all rounded-md border bg-muted/30 p-2 text-[10px]">
              {otpauthUri}
            </code>
            <p className="text-[11px] text-muted-foreground">
              Or import manually: secret is at the end of the URI.
              Issuer: <strong>{projectName}</strong>
            </p>
            <form onSubmit={verifyEnroll} className="space-y-2">
              <Field label="6-digit code">
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm tracking-widest text-center"
                />
              </Field>
              <button
                type="submit"
                disabled={busy}
                style={buttonStyle}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Verifying…" : "Verify"}
              </button>
            </form>
          </div>
        ) : null}
        {recoveryCodes ? (
          <div className="mt-3 rounded-md border border-amber-300/50 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Save these recovery codes
            </p>
            <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
              Each can be used once if you lose your authenticator. Shown once — copy now.
            </p>
            <pre className="mt-2 grid grid-cols-2 gap-1 text-[11px] font-mono">
              {recoveryCodes.map((c) => (
                <code key={c}>{c}</code>
              ))}
            </pre>
            <button
              type="button"
              onClick={() => setRecoveryCodes(null)}
              className="mt-2 rounded-md border px-2 py-1 text-[11px] hover:bg-amber-100 dark:hover:bg-amber-900/50"
            >
              I've saved them
            </button>
          </div>
        ) : null}
        {mfa?.enrolled && !otpauthUri ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Two-factor is enabled. {mfa.recoveryCodesRemaining} recovery codes remaining.
            </p>
            <Field label="Current password to disable">
              <input
                type="password"
                value={disablePwd}
                onChange={(e) => setDisablePwd(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <button
              type="button"
              onClick={disableMfa}
              disabled={busy || !disablePwd}
              className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
            >
              Disable two-factor
            </button>
          </div>
        ) : null}
      </div>

      {/* Passkeys */}
      <div className="rounded-md border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Passkeys</h3>
          <button
            type="button"
            onClick={registerPasskey}
            disabled={busy}
            style={buttonStyle}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            Add passkey
          </button>
        </div>
        {passkeys.length === 0 ? (
          <p className="text-xs text-muted-foreground">No passkeys yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            {passkeys.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-start justify-between gap-2 px-3 py-2 text-xs ${i > 0 ? "border-t" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {p.deviceName ?? "Unnamed device"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {p.credentialIdPrefix}… ·{" "}
                    {p.lastUsedAt ? `last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : "never used"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removePasskey(p.id)}
                  className="rounded-md border px-2 py-1 text-[10px] hover:bg-muted"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {msg ? (
        <div className="rounded-md border border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm">
          {msg}
        </div>
      ) : null}
    </div>
  )
}

// ─── Danger zone tab ──────────────────────────────────────────────────────

function DangerTab({
  projectSlug,
  token,
  onDeleted,
  primaryColor,
}: {
  projectSlug: string
  token: string
  onDeleted: () => void
  primaryColor: string | null
}) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const buttonStyle = primaryColor ? { background: primaryColor } : undefined

  async function requestDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!confirm("Send the deletion confirmation email?")) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(
        `/api/v1/auth/${projectSlug}/me/account/delete-request`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword: password }),
        },
      )
      const j = await res.json()
      if (res.ok) {
        setMsg({
          kind: "ok",
          text: "Check your email for the deletion confirmation link.",
        })
        setPassword("")
      } else {
        setMsg({
          kind: "err",
          text: j.error_description || j.error || "Failed.",
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <h3 className="mb-1 text-sm font-semibold text-destructive">
        Delete account
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Permanently removes your account and all data. You'll receive an email
        with a confirmation link — your account is deleted only after you click it.
      </p>
      <form onSubmit={requestDelete} className="space-y-2">
        <Field label="Current password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </Field>
        <button
          type="submit"
          disabled={busy || !password}
          style={buttonStyle}
          className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Request deletion"}
        </button>
      </form>
      {msg ? (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${msg.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  )
}
