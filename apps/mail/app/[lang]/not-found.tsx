import { ErrorPage } from "@workspace/console/components/shared/error-page"

export default function NotFound() {
  return (
    <ErrorPage
      code={404}
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
    />
  )
}
