"use client"

import React from "react"
import { Button } from "@workspace/ui/components/button"

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg font-medium">Something went wrong</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
