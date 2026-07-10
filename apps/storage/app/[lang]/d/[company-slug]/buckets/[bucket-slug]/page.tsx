import type { Metadata } from "next"
import { BucketDetailContent } from "@/components/buckets/bucket-detail-content"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ "bucket-slug": string }>
}): Promise<Metadata> {
  const { "bucket-slug": bucketSlug } = await params
  return { title: bucketSlug }
}

export default async function BucketDetailPage({
  params,
}: {
  params: Promise<{ "bucket-slug": string }>
}) {
  const { "bucket-slug": bucketSlug } = await params
  return <BucketDetailContent bucketSlug={bucketSlug} />
}
