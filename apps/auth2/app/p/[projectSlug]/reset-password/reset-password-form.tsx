"use client"

import { useState, useTransition } from "react"
import type { AuthProjectPasswordPolicy } from "@workspace/db/models/auth-project"

/**
 * Reset-password client form. Tek input (new password) + confirm; submit
 * üzerine `/api/v1/auth/[slug]/password-reset/confirm` endpoint'ine POST
 * eder. Endpoint zaten API key gerektirmez (token-of-knowledge) — bu
 * sayfa same-origin'dan call yapar.
 *
 * Policy hint'leri (minLength, uppercase, number) form'un altında render
 * edilir; client-side check submit'i bloklamaz, sunucu authoritative.
 * Sunucu policy reject ederse hata mesajını render eder.
 */

interface Props {
  projectSlug: string
  token: string
  passwordPolicy: AuthProjectPasswordPolicy
  primaryColor: string | null
}

export function ResetPasswordForm({
  projectSlug,
  token,
  passwordPolicy,
  primaryColor,
}: Props) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const buttonStyle = primaryColor
    ? { background: primaryColor }
    : undefined

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    if (password.length < passwordPolicy.minLength) {
      setError(
        `Password must be at least ${passwordPolicy.minLength} characters.`,
      )
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/v1/auth/${encodeURIComponent(projectSlug)}/password-reset/confirm`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, newPassword: password }),
          },
        )
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          error_description?: string
        }
        if (!res.ok) {
          setError(
            json.error_description ||
              json.error ||
              "Could not reset password. Please try again.",
          )
          return
        }
        setSuccess(true)
      } catch {
        setError("Network error. Please try again.")
      }
    })
  }

  if (success) {
    return (
      <div className="space-y-3 text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: `${primaryColor || "#16a34a"}1a` }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={primaryColor || "#16a34a"}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="text-base font-medium">Password updated.</p>
        <p className="text-sm text-muted-foreground">
          You can close this tab and sign in with the new password.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="rp-password" className="text-sm font-medium">
          New password
        </label>
        <input
          id="rp-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={passwordPolicy.minLength}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="rp-confirm" className="text-sm font-medium">
          Confirm password
        </label>
        <input
          id="rp-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          minLength={passwordPolicy.minLength}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
        />
      </div>

      <PasswordHints policy={passwordPolicy} />

      {error ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        style={buttonStyle}
        className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-sm transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Update password"}
      </button>
    </form>
  )
}

function PasswordHints({
  policy,
}: {
  policy: AuthProjectPasswordPolicy
}) {
  const hints: string[] = [`At least ${policy.minLength} characters`]
  if (policy.requireUppercase) hints.push("An uppercase letter")
  if (policy.requireNumber) hints.push("A number")

  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground pl-4 list-disc">
      {hints.map((h) => (
        <li key={h}>{h}</li>
      ))}
    </ul>
  )
}
