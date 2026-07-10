import { BackupManager } from "@/components/backup-manager"

export default async function CompanyRootPage({
  params,
}: {
  params: Promise<{ "company-slug": string }>
}) {
  const { "company-slug": slug } = await params
  return <BackupManager companySlug={slug} />
}
