"use client"

import { useState, useTransition } from "react"
import type { AuthProjectPasswordPolicy } from "@workspace/db/models/auth-project"

interface Props {
  projectSlug: string
  token: string
  email: string
  passwordPolicy: AuthProjectPasswordPolicy
  primaryColor: string | null
}

export function InvitationAcceptForm({
  projectSlug,
  token,
  email,
  passwordPolicy,
  primaryColor,
}: Props) {
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const buttonStyle = primaryColor ? { background: primaryColor } : undefined

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    if (password.length < passwordPolicy.minLength) {
      setError(`Password must be at least ${passwordPolicy.minLength} characters.`)
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/v1/auth/${encodeURIComponent(projectSlug)}/invitation/accept`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              password,
              displayName: displayName.trim() || undefined,
            }),
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
              "Could not accept invitation. Please try again.",
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
        <p className="text-base font-medium">Welcome!</p>
        <p className="text-sm text-muted-foreground">
          Your account is ready. You're signed in — sign in on your other devices
          with this email and password.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="inv-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="inv-email"
          type="email"
          value={email}
          readOnly
          disabled
          className="w-full rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="inv-name" className="text-sm font-medium">
          Display name (optional)
        </label>
        <input
          id="inv-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="inv-password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="inv-password"
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
        <label htmlFor="inv-confirm" className="text-sm font-medium">
          Confirm password
        </label>
        <input
          id="inv-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          minLength={passwordPolicy.minLength}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
        />
      </div>
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
        {isPending ? "Creating account…" : "Accept invitation"}
      </button>
    </form>
  )
}
