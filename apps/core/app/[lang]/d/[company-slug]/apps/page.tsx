import { AppSubmissionsContent } from "@/components/app-store/app-submissions-content"

/**
 * Geliştirici konsolu — şirketin App Store gönderimleri. Membership +
 * app-store.manage `core-company-dashboard-shell` (sidebar görünürlüğü) ve API
 * (assertCompanyAccess) tarafından zorlanır. OS'ta iframe+embed ile sidebar
 * gizlenir → temiz içerik.
 */
export default async function CompanyAppsPage({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug } = await params
  return <AppSubmissionsContent slug={slug} />
}
