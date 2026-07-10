/**
 * Sentroy social stack — intranet-style activity feed scoped to a single
 * company. All posts/comments/reactions are visible only to members of
 * the owning `companyId`; cross-company sharing is intentionally not
 * supported in this iteration.
 *
 * Posts compose into three optional pieces:
 *   - `text` (Twitter-like, plain text up to 1000 chars; auto-link is
 *     a render concern, the stored body stays raw)
 *   - `attachments` (image previews picked from the company's media
 *     library or new uploads)
 *   - `repostOf` (a pointer to another post; non-null means this is a
 *     repost. Reposts may carry their own `text` as a quote-comment.)
 */

export type ReactionKey =
  | "like"
  | "fire"
  | "lmao"
  | "clap"
  | "cool"
  | "mind_blown"
  | "thinking"
  | "raised_eyebrow"
  | "sad"
  | "angry"
// Not: "love" (kalp) kaldırıldı. Eski "love" reaksiyon kayıtları DB'de kalabilir;
// UI bilinmeyen key'i graceful atlar (getReactionDef → null).

/**
 * Post gizlilik seviyesi. v1 enforcement: `public` pratikte `members` gibi
 * davranır (dış/anonim yüzey sonraki faz) — alan 4 değeri saklar ki UI seçimi
 * korunsun. `admins`: owner/admin (+author). `author`: yalnız yazar.
 */
export type SocialPostVisibility = "public" | "members" | "admins" | "author"

export interface SocialPostAttachment {
  /** Media item id from the storage app (`media.id`). */
  mediaId: string
  /** CDN-served URL stamped at attach-time. UI uses this directly to
   *  avoid a per-attachment lookup; if the underlying media is removed
   *  the link will 404 — render layer should fall back gracefully. */
  url: string
  /** Optional dimensions for skeleton/aspect ratio in feed grid. */
  width?: number
  height?: number
  /** Defensive type marker so future audio/video attachments can extend
   *  without a destructive migration. */
  type: "image"
}

export interface SocialPost {
  id: string
  /** Owning company. Visibility filter — all reads are gated on the
   *  caller being a member of this company. */
  companyId: string
  authorUserId: string
  /** Up to 1000 chars of plain text. Empty string allowed when an
   *  image-only or repost-only post is published. Rich posts also keep a
   *  plaintext copy here for search/preview/notification fallback. */
  text: string
  /** TipTap'tan üretilen sanitize edilmiş zengin HTML. null → eski/düz post
   *  (render `text`'e düşer). */
  bodyHtml: string | null
  /** Mention edilen kullanıcı id'leri (bildirim/indeksleme için). */
  mentions: string[]
  /**
   * Yanıt zinciri (yorumlar post'a birleşti — comments-as-posts):
   *  - `parentId`: doğrudan yanıtlanan post/yanıt (null → top-level post).
   *  - `rootId`: thread'in en üst post'u (top-level için null/self).
   */
  parentId: string | null
  rootId: string | null
  /** Gizlilik seviyesi (default `members`). */
  visibility: SocialPostVisibility
  attachments: SocialPostAttachment[]
  /** When non-null, this post wraps another post (repost). The wrapped
   *  post's `companyId` must match this post's `companyId` to keep the
   *  intranet boundary; cross-company reposts are rejected upstream. */
  repostOf: string | null
  /** Cached counters bumped via `$inc` to avoid count() per page render.
   *  Drift can be reconciled by an offline rebuild job. */
  commentCount: number
  reactionCount: number
  repostCount: number
  /** Soft delete — keeps comment threads intact while hiding the
   *  original from feeds. UI shows a "post removed" placeholder. */
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SocialComment {
  id: string
  postId: string
  /** Denormalised so that comment list endpoints don't need a join to
   *  enforce visibility — callers compare against the post's company. */
  companyId: string
  authorUserId: string
  text: string
  reactionCount: number
  deletedAt: Date | null
  createdAt: Date
}

export interface SocialReaction {
  id: string
  /** Targets are either posts or comments — same collection, different
   *  `targetType`. A unique compound index on
   *  `(targetType, targetId, userId, reactionKey)` enforces "one user,
   *  one reaction-of-each-kind per target" so toggling is idempotent. */
  targetType: "post" | "comment"
  targetId: string
  /** Denormalised company id for fast company-scoped fan-outs. */
  companyId: string
  userId: string
  reactionKey: ReactionKey
  createdAt: Date
}
