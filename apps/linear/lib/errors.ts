/** Triage app/lib/errors.ts birebir portu. */

export class AppError extends Error {
  readonly code: string
  readonly status: number
  readonly cause?: unknown

  constructor(opts: {
    message: string
    code?: string
    status?: number
    cause?: unknown
  }) {
    super(opts.message)
    this.name = "AppError"
    this.code = opts.code ?? "APP_ERROR"
    this.status = opts.status ?? 500
    this.cause = opts.cause
  }
}

export class AuthError extends AppError {
  constructor(message: string, opts: { status?: number; cause?: unknown } = {}) {
    super({
      message,
      code: "AUTH_ERROR",
      status: opts.status ?? 401,
      cause: opts.cause,
    })
    this.name = "AuthError"
  }
}

export class RequestError extends AppError {
  readonly source: string
  readonly bodyExcerpt: string
  readonly requestId: string

  constructor(opts: {
    source: string
    status: number
    bodyExcerpt: string
    requestId: string
    cause?: unknown
  }) {
    super({
      message: `[${opts.source}] HTTP ${opts.status}: ${opts.bodyExcerpt.slice(0, 200)}`,
      code: "REQUEST_ERROR",
      status: opts.status,
      cause: opts.cause,
    })
    this.name = "RequestError"
    this.source = opts.source
    this.bodyExcerpt = opts.bodyExcerpt
    this.requestId = opts.requestId
  }
}

export class LinearError extends AppError {
  constructor(message: string, opts: { status?: number; cause?: unknown } = {}) {
    super({
      message,
      code: "LINEAR_ERROR",
      status: opts.status ?? 502,
      cause: opts.cause,
    })
    this.name = "LinearError"
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded") {
    super({ message, code: "RATE_LIMIT", status: 429 })
    this.name = "RateLimitError"
  }
}
