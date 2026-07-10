import { AuthProjectDetailContent } from "@workspace/console/components/auth/auth-project-detail-content"

export default async function AuthProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AuthProjectDetailContent projectId={id} />
}
