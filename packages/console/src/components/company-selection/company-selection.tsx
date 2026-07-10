"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { useCompanyStore, type CompanyListItem } from "@workspace/console/stores/company"
import { PageTransition, PageLoading } from "@workspace/console/components/shared"
import { AppShell } from "@workspace/console/components/layout/app-shell"
import { VersionTag } from "@workspace/console/components/sidebar/version-tag"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent } from "@workspace/ui/components/card"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  ArrowRight01Icon,
  Loading03Icon,
  Building03Icon,
  Settings05Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

/** Company adindan baslangic harfleri — avatar placeholder icin. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/**
 * Card içindeki avatar — image yüklenemezse initials fallback'e geçer.
 * Per-card state gerektiği için ayrı sub-component (parent map içinde).
 */
function CompanyCardAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null | undefined
  name: string
}) {
  const [errored, setErrored] = useState(false)
  useEffect(() => {
    setErrored(false)
  }, [avatarUrl])
  if (avatarUrl && !errored) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={avatarUrl}
        alt=""
        onError={() => setErrored(true)}
        className="size-full object-cover"
      />
    )
  }
  return (
    <span className="text-sm font-semibold text-primary">
      {getInitials(name)}
    </span>
  )
}

export function CompanySelection({
  lang,
  session,
}: {
  lang: string
  session: { user: { name?: string | null; role?: string | null } }
}) {
  const t = useTranslations("companySelection")
  const tTeam = useTranslations("team")
  const tCommon = useTranslations("common")
  const router = useRouter()

  const fetchCompanies = useCompanyStore((s) => s.fetchCompanies)

  const companies = useCompanyStore((s) => s.companies)
  const loading = useCompanyStore((s) => s.companiesLoading)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selectingId, setSelectingId] = useState<string | null>(null)

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  useEffect(() => {
    if (loading) return
    if (companies.length === 1 && !selectingId) {
      setSelectingId(companies[0].id)
      router.replace(`/${lang}/d/${companies[0].slug}`)
    }
  }, [loading, companies, selectingId, lang, router])

  function handleSelect(company: CompanyListItem) {
    if (selectingId) return
    setSelectingId(company.id)
    router.push(`/${lang}/d/${company.slug}`)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCreating(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t("createFailed"))
        setCreating(false)
        return
      }

      toast.success(t("companyCreated"))
      useCompanyStore.getState().invalidateCompanies()
      setShowCreate(false)
      router.push(`/${lang}/d/${json.data.slug}`)
    } catch {
      toast.error(t("genericError"))
      setCreating(false)
    }
  }

  function translateRole(role: string | undefined): string {
    const r = role ?? "member"
    try {
      return tTeam(r as "owner" | "admin" | "member")
    } catch {
      return r
    }
  }

  if (loading) return <PageLoading />

  const userRole = session?.user?.role
  const isAdmin = userRole === "admin"
  const hasCompanies = companies.length > 0

  return (
    <AppShell showTeamSwitcher={false} width="default">
      <PageTransition>
        <div className="flex w-full flex-col items-center">
          <div className="flex min-h-[calc(100svh-9rem)] w-full max-w-4xl flex-col justify-center gap-10 py-4 md:gap-12 md:py-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {t("title")}
              </h1>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/${lang}/admin`)}
                  className="gap-2"
                >
                  <HugeiconsIcon
                    icon={Settings05Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                  {t("openAdminPanel")}
                </Button>
              )}
            </motion.div>

            <div className="w-full">
              {hasCompanies ? (
                <>
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: {},
                      visible: {
                        transition: {
                          staggerChildren: 0.08,
                          delayChildren: 0.12,
                        },
                      },
                    }}
                    className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2"
                  >
                    {companies.map((company) => {
                      const isSelecting = selectingId === company.id
                      const anySelecting = selectingId !== null
                      return (
                        <motion.div
                          key={company.id}
                          variants={{
                            hidden: { opacity: 0, y: 16, scale: 0.98 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              scale: 1,
                              transition: {
                                duration: 0.4,
                                ease: [0.22, 1, 0.36, 1],
                              },
                            },
                          }}
                          whileHover={{ y: -4, transition: { duration: 0.2 } }}
                          whileTap={{
                            scale: 0.98,
                            transition: { duration: 0.1 },
                          }}
                          className="will-change-transform"
                        >
                          <button
                            type="button"
                            disabled={anySelecting && !isSelecting}
                            onClick={() => handleSelect(company)}
                            className="group block w-full text-start disabled:opacity-50"
                          >
                            <Card className="relative h-full overflow-hidden border bg-card transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/8 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                              />
                              <CardContent className="relative flex h-full flex-col gap-4 p-6">
                                <div className="flex items-start justify-between gap-3">
                                  <motion.div
                                    whileHover={{
                                      scale: 1.08,
                                      rotate: 4,
                                      transition: {
                                        duration: 0.3,
                                        ease: [0.34, 1.56, 0.64, 1],
                                      },
                                    }}
                                    className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border transition-colors duration-300 group-hover:bg-primary/10 group-hover:ring-primary/30"
                                  >
                                    <CompanyCardAvatar
                                      avatarUrl={company.avatarUrl}
                                      name={company.name}
                                    />
                                  </motion.div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className="text-xs text-muted-foreground"
                                    >
                                      {translateRole(company.role)}
                                    </Badge>
                                    {isSelecting ? (
                                      <HugeiconsIcon
                                        icon={Loading03Icon}
                                        strokeWidth={2}
                                        className="size-4 animate-spin text-muted-foreground"
                                      />
                                    ) : (
                                      <HugeiconsIcon
                                        icon={ArrowRight01Icon}
                                        strokeWidth={2}
                                        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                                      />
                                    )}
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-lg font-semibold tracking-tight">
                                    {company.name}
                                  </div>
                                  <p className="mt-0.5 truncate font-mono text-sm text-muted-foreground">
                                    {company.slug}
                                  </p>
                                </div>
                              </CardContent>
                            </Card>
                          </button>
                        </motion.div>
                      )
                    })}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.35 }}
                    className="mt-5"
                  >
                    <Button
                      variant="outline"
                      className="h-12 w-full gap-2 border-dashed sm:max-w-sm"
                      onClick={() => setShowCreate(true)}
                      disabled={selectingId !== null}
                    >
                      <HugeiconsIcon
                        icon={PlusSignIcon}
                        strokeWidth={2}
                        className="size-4"
                      />
                      {t("createNew")}
                    </Button>
                  </motion.div>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-muted/20 p-10 text-center"
                >
                  <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <HugeiconsIcon icon={Building03Icon} strokeWidth={2} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h2 className="font-semibold">{t("noCompaniesTitle")}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t("noCompaniesDesc")}
                    </p>
                  </div>
                  <Button onClick={() => setShowCreate(true)}>
                    <HugeiconsIcon
                      icon={PlusSignIcon}
                      strokeWidth={2}
                      className="size-4"
                      data-icon="inline-start"
                    />
                    {t("createFirst")}
                  </Button>
                </motion.div>
              )}
            </div>

            <div className="flex justify-center pt-2">
              <VersionTag />
            </div>
          </div>
        </div>
      </PageTransition>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>
            <DialogDescription>{t("createDialogDesc")}</DialogDescription>
          </DialogHeader>
          <form
            id="create-company-form"
            onSubmit={handleCreate}
            className="flex flex-col gap-4"
          >
            <Field>
              <FieldLabel htmlFor="name">{t("companyName")}</FieldLabel>
              <Input
                id="name"
                name="name"
                placeholder={t("companyNamePlaceholder")}
                required
                autoFocus
                disabled={creating}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              form="create-company-form"
              disabled={creating}
            >
              {creating && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {creating ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
