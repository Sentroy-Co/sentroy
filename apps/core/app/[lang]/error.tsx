"use client"

import { useEffect } from "react"
import { ErrorPage } from "@workspace/console/components/shared/error-page"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[error]", error)
  }, [error])

  return (
    <ErrorPage
      code={500}
      title="Something went wrong"
      description="An unexpected error occurred. Please try again."
      retry={reset}
    />
  )
}
