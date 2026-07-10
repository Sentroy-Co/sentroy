"use client"

import { useEffect } from "react"
import { ErrorPage } from "@workspace/console/components/shared/error-page"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[dashboard-error]", error)
  }, [error])

  return (
    <ErrorPage
      code={500}
      title="Something went wrong"
      description="An error occurred while loading this page."
      retry={reset}
    />
  )
}
