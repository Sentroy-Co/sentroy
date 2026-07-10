import { redirect } from "next/navigation"

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  redirect(`/${lang}/admin/users`)
}
