import type { NextFunction, Request, Response } from 'express'

const ALLOWED_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'
const DEFAULT_ALLOWED_HEADERS = [
  'Accept',
  'Accept-Language',
  'Authorization',
  'Content-Language',
  'Content-Type',
  'Range',
  'X-Requested-With',
  'X-CDN-Secret',
  'X-Company-Id',
  'X-Bucket-Id',
  'X-User-Id',
  'X-User-Email',
  'X-User-Admin',
].join(', ')

const PUBLIC_FILE_EXPOSED_HEADERS = [
  'Accept-Ranges',
  'Content-Disposition',
  'Content-Length',
  'Content-Range',
  'Content-Type',
  'ETag',
  'Last-Modified',
  'X-Sentroy-Ladder',
  'X-Sentroy-Variant',
]

const configuredOrigins = new Set(
  (process.env.CDN_CORS_ORIGINS || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin)),
)

const allowAllConfigured = configuredOrigins.has('*')

function normalizeOrigin(origin: string | undefined): string | null {
  const raw = origin?.trim()
  if (!raw) return null
  if (raw === '*') return '*'

  try {
    const url = new URL(raw)
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

function isSentroyOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'sentroy.com' || url.hostname.endsWith('.sentroy.com'))
    )
  } catch {
    return false
  }
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '::1')
    )
  } catch {
    return false
  }
}

function isAllowedAppOrigin(origin: string | null): boolean {
  if (!origin) return false
  if (allowAllConfigured) return true
  if (configuredOrigins.has(origin)) return true
  return isSentroyOrigin(origin) || isLocalDevOrigin(origin)
}

function isPublicFilePath(path: string): boolean {
  return path === '/f' || path.startsWith('/f/')
}

function requestOrigin(req: Request): string | null {
  const raw = req.headers.origin
  return typeof raw === 'string' ? normalizeOrigin(raw) : null
}

function requestedHeaders(req: Request): string {
  const raw = req.headers['access-control-request-headers']
  return typeof raw === 'string' && raw.trim() ? raw : DEFAULT_ALLOWED_HEADERS
}

function setVaryOrigin(res: Response): void {
  res.vary('Origin')
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = requestOrigin(req)
  const isPublicFile = isPublicFilePath(req.path)
  const allowOrigin = isPublicFile || isAllowedAppOrigin(origin)

  if (origin && allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    setVaryOrigin(res)
  } else if (!origin && isPublicFile) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
    res.setHeader('Access-Control-Allow-Headers', requestedHeaders(req))
    res.setHeader('Access-Control-Max-Age', '86400')
    res.setHeader(
      'Access-Control-Expose-Headers',
      PUBLIC_FILE_EXPOSED_HEADERS.join(', '),
    )
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  next()
}

export function publicFileCorsHeaders(
  req: Request,
  extraExpose: string[] = [],
): Record<string, string> {
  const origin = requestOrigin(req)
  const exposed = Array.from(new Set([...PUBLIC_FILE_EXPOSED_HEADERS, ...extraExpose]))

  return {
    'Access-Control-Allow-Origin': origin || '*',
    ...(origin ? { 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': exposed.join(', '),
    'Cross-Origin-Resource-Policy': 'cross-origin',
  }
}
