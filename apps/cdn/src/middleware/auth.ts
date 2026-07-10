import { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'node:crypto'

/** Constant-time secret comparison — closes the timing side-channel. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Shared secret auth for admin CDN routes.
 *
 * Consuming app (sentroy-monorepo/apps/storage) proxies every request with:
 *   - x-cdn-secret:  CDN_API_SECRET (required)
 *   - x-company-id:  tenant this request is scoped to (required)
 *   - x-bucket-id:   bucket this request targets (required for upload/list/delete)
 *   - x-user-id:     auth user id of the caller (audit only)
 *   - x-user-email:  (optional) for richer audit logs
 *
 * bucketId + companyId are the authoritative scope; we never trust the
 * consuming app's client-side data — it must validate access to the bucket
 * on its side before signing and forwarding the request.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-cdn-secret'] as string
  const expected = process.env.CDN_API_SECRET

  if (!secret || !expected || !safeEqual(secret, expected)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const companyId = req.headers['x-company-id'] as string | undefined
  const bucketId = req.headers['x-bucket-id'] as string | undefined
  const userId = req.headers['x-user-id'] as string | undefined

  if (!companyId) {
    res.status(400).json({ error: 'Missing x-company-id header' })
    return
  }

  ;(req as any).companyId = companyId
  ;(req as any).bucketId = bucketId
  ;(req as any).userId = userId
  ;(req as any).userEmail = req.headers['x-user-email'] as string | undefined

  next()
}
