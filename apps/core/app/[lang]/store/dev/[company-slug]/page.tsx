import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkBadge01Icon, StarIcon } from "@hugeicons/core-free-icons"
import { companyModel, sentroyAppModel } from "@workspace/db/models"

interface PageProps {
  params: Promise<{ lang: string; "company-slug": string }>
}

/**
 * Public geliştirici profili — App Store'dan dışarıya açık link. YALNIZ
 * yayınlanan (approved+public+enabled) uygulamaları + public-safe bilgiyi
 * gösterir. İntranet feed/üye listesi YOK (o `/profile/c` üye-kapısında kalır).
 * Anonim erişilebilir. Yayınlanmış app'i olmayan şirket için 404 (varlığını
 * herkese açmaz).
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { "company-slug": slug } = await params
  const slugLower = slug.toLowerCase()
  const company = await companyModel.findBySlug(slugLower)
  if (company) {
    return {
      title: `${company.name} — Apps on Sentroy`,
      description: company.description ?? `Apps published by ${company.name} on the Sentroy App Store.`,
    }
  }
  // Registry developer fallback (Faz 5).
  const regApps = await sentroyAppModel.findByRegistryDeveloperSlug(slugLower)
  const name = regApps[0]?.registryDeveloper?.name
  if (name) {
    return {
      title: `${name} — Apps on Sentroy`,
      description: `Apps published by ${name} on the Sentroy App Store.`,
    }
  }
  return { title: "Not found" }
}

interface DeveloperProfile {
  name: string
  avatarUrl: string | null
  coverImageUrl: string | null
  description: string | null
  verified: boolean
}

export default async function DeveloperProfilePage({ params }: PageProps) {
  const { lang, "company-slug": slug } = await params
  const slugLower = slug.toLowerCase()
  const company = await companyModel.findBySlug(slugLower)

  // Yerel company önce. Yoksa registry-developer branch (Faz 5): slug bir
  // registryDeveloper.slug'a düşerse o app'leri göster (404 değil).
  let profile: DeveloperProfile
  let apps
  if (company) {
    const all = await sentroyAppModel.findByCompany(company.id)
    apps = all.filter((a) => a.status === "approved" && a.visibility === "public" && a.enabled)
    profile = {
      name: company.name,
      avatarUrl: company.avatarUrl ?? null,
      coverImageUrl: company.coverImageUrl ?? null,
      description: company.description ?? null,
      verified: true,
    }
  } else {
    apps = await sentroyAppModel.findByRegistryDeveloperSlug(slugLower)
    if (apps.length === 0) notFound()
    const dev = apps[0]?.registryDeveloper ?? null
    profile = {
      name: dev?.name ?? slugLower,
      avatarUrl: null,
      coverImageUrl: null,
      description: null,
      verified: dev?.verified ?? false,
    }
  }
  if (apps.length === 0) notFound()

  return (
    <main className="min-h-screen bg-muted/20">
      {/* Cover */}
      <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
        {profile.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.coverImageUrl} alt="" className="size-full object-cover" />
        ) : null}
      </div>

      <div className="mx-auto -mt-12 w-full max-w-4xl px-5 pb-16">
        {/* Identity */}
        <div className="flex items-end gap-4">
          <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-card text-2xl font-bold text-muted-foreground shadow-lg ring-4 ring-background">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              profile.name.charAt(0).toUpperCase()
            )}
          </span>
          <div className="pb-1">
            <h1 className="flex items-center gap-1.5 text-2xl font-bold">
              {profile.name}
              {profile.verified ? (
                <span title="Verified developer">
                  <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-5 text-sky-500" />
                </span>
              ) : null}
            </h1>
            <p className="text-sm text-muted-foreground">{apps.length} app{apps.length === 1 ? "" : "s"} on Sentroy</p>
          </div>
        </div>

        {profile.description ? (
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{profile.description}</p>
        ) : null}

        {/* Apps */}
        <h2 className="mb-3 mt-8 text-sm font-semibold">Apps</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {apps.map((a) => (
            <Link
              key={a.appId}
              href={`/${lang}`}
              className="group flex items-center gap-3 rounded-2xl border bg-background p-3 transition hover:shadow-md"
            >
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5" style={{ background: a.appearance.color }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.appearance.logoUrl} alt="" className="size-full object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{a.name}</div>
                <div className="truncate text-xs text-muted-foreground">{a.tagline ?? ""}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="flex">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <HugeiconsIcon key={i} icon={StarIcon} className={"size-3 " + (i <= Math.round(a.ratingAvg) ? "text-amber-500" : "text-muted-foreground/30")} strokeWidth={2} />
                    ))}
                  </span>
                  {a.ratingCount > 0 ? <span>{a.ratingAvg.toFixed(1)} ({a.ratingCount})</span> : <span>New</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Discover more on the <Link href={`/${lang}`} className="underline hover:text-foreground">Sentroy App Store</Link>.
        </p>
      </div>
    </main>
  )
}
