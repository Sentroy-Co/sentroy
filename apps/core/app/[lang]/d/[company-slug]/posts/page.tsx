import { redirect } from "next/navigation"

interface PageProps {
  params: Promise<{ lang: string; "company-slug": string }>
}

/**
 * `/posts` was the standalone team feed page. The feed now lives
 * inline on the dashboard home so the user sees company activity
 * the moment they land. We keep this route as a permanent redirect
 * so old links (sidebar shortcuts, in-app notifications, bookmarks
 * from the previous shell) still resolve to the same content.
 */
export default async function CompanyFeedRedirect({ params }: PageProps) {
  const { lang, "company-slug": slug } = await params
  redirect(`/${lang}/d/${slug}`)
}
