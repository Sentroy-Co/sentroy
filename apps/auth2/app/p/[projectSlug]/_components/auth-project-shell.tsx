import type { AuthProject } from "@workspace/db/models/auth-project"

/**
 * Auth project landing page shell. Verify-email + reset-password
 * sayfalarında ortak — project'in branding'ini (logoUrl, displayName,
 * primaryColor) render eder.
 *
 * Server component — interactivity child'lara bırakılır.
 */
export function AuthProjectShell({
  project,
  title,
  children,
}: {
  project: AuthProject
  title: string
  children: React.ReactNode
}) {
  const displayName = project.branding.displayName || project.name
  const logoUrl = project.branding.logoUrl

  return (
    <div className="min-h-svh flex items-center justify-center px-4 py-8 bg-muted/30">
      <div className="w-full max-w-md rounded-2xl border bg-background shadow-sm">
        <div className="p-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            {logoUrl ? (
              // Project logo — height clamp, mail template ile aynı kural
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={displayName}
                className="h-12 max-w-[200px] object-contain"
              />
            ) : (
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {displayName}
              </div>
            )}
            <h1 className="text-xl font-semibold tracking-tight text-center">
              {title}
            </h1>
          </div>
          {children}
        </div>
        <div className="px-8 py-4 border-t text-center text-xs text-muted-foreground">
          Powered by{" "}
          <a
            href="https://sentroy.com"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:underline"
          >
            Sentroy
          </a>{" "}
          Auth
        </div>
      </div>
    </div>
  )
}
