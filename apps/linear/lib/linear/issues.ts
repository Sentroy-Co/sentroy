/**
 * Issue servis katmanı (triage issues.server.ts portu, ctx'li).
 *
 * Multi-tenant değişikliği: env/settings resolver'ları (panel etiketi,
 * varsayılan takım/etiket/durum, actorApp) `ctx` alanlarına taşındı; cache
 * key'leri ctx.companyId prefix'li. Panel attachment/label filtresi,
 * buildProxyHeader metinleri, createPanelAttachment, sortOrder ve cursor
 * pagination davranışı triage ile birebir.
 */

import { linearGraphQL } from "./client"
import {
  ATTACHMENT_CREATE_MUTATION,
  COMMENT_DELETE_MUTATION,
  COMMENT_UPDATE_MUTATION,
  CREATE_COMMENT_MUTATION,
  CREATE_ISSUE_MUTATION,
  ISSUE_ARCHIVE_MUTATION,
  ISSUE_BY_ID_QUERY,
  ISSUE_RELATION_CREATE_MUTATION,
  ISSUE_UPDATE_MUTATION,
  ISSUE_UPDATE_STATE_MUTATION,
  ISSUE_STATES_QUERY,
  LIST_ISSUES_QUERY,
  SEARCH_ISSUES_QUERY,
} from "./queries"
import { LinearError } from "../errors"
import { logger } from "../logger"
import { buildProxyHeader, type ResolvedRequester } from "./mapping"
import { cache, TTL } from "../cache"
import { uploadToStorage } from "../storage"
import { getTeams, getTeamLabels, getTeamStates } from "./metadata"
import type { LinearContext } from "./context"
import {
  LEGACY_PROXY_HEADER_OPEN,
  ATTRIBUTION_SIGNATURE_LINEAR,
  ATTRIBUTION_SIGNATURE_PROXY,
  ATTRIBUTION_SIGNATURE_PROXY_LEGACY,
} from "./constants"

import type {
  Issue,
  IssueAttachment,
  IssueChildRef,
  IssueComment,
  IssueHistoryEvent,
  IssueLabel,
  IssuePage,
  IssuePriority,
  IssueUser,
  IssueState,
} from "./types"

type RawLabelsConnection = { labels: { nodes: Issue["labels"] } }
type RawIssue = Omit<Issue, "labels"> & RawLabelsConnection
type ListIssuesResponse = {
  issues: {
    nodes: RawIssue[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
}
type RawHistoryEvent = {
  id: string
  createdAt: string
  actor: IssueUser | null
  fromState: IssueState | null
  toState: IssueState | null
  fromAssignee: IssueUser | null
  toAssignee: IssueUser | null
  fromPriority: IssuePriority | null
  toPriority: IssuePriority | null
  fromTitle: string | null
  toTitle: string | null
  addedLabelIds: string[] | null
  removedLabelIds: string[] | null
  archived: boolean | null
}

type RawComment = Omit<IssueComment, "parentId"> & {
  parent?: { id: string } | null
}

type IssueByIdResponse = {
  issue:
    | (RawIssue & {
        comments: { nodes: RawComment[] }
        attachments: { nodes: IssueAttachment[] }
        history: { nodes: RawHistoryEvent[] }
        children: { nodes: IssueChildRef[] }
      })
    | null
}

type CreateIssueResponse = {
  issueCreate: { success: boolean; issue: RawIssue | null }
}
type CreateCommentResponse = {
  commentCreate: { success: boolean; comment: IssueComment | null }
}

function normalize(raw: RawIssue): Issue {
  return {
    ...raw,
    labels: raw.labels.nodes,
  }
}

/**
 * Panel attachment'ının / "Linear Lite'ta aç" derin bağlantısının base URL'i.
 * Not: dashboard rotası `/{lang}/d/{company-slug}/tasks/{id}` şeklinde ve
 * ctx'te company SLUG yok (yalnız companyId) — bu yüzden kök `/tasks/{id}`
 * yolu kullanılır; işlev tespit/dedupe işaretçisidir, tam derin-link değil.
 */
function panelTaskUrl(issueId: string): string {
  const base = (
    process.env.NEXT_PUBLIC_LINEAR_APP_URL || "https://linear.sentroy.com"
  ).replace(/\/+$/, "")
  return `${base}/tasks/${issueId}`
}

export type ListIssuesScope = "mine" | "workspace"

export type ListIssuesArgs = {
  requester: ResolvedRequester
  scope?: ListIssuesScope
  cursor?: string | null
  pageSize?: number
  teamId?: string
  stateType?: "open" | "closed" | "all"
  assigneeIds?: string[]
  labelIds?: string[]
  /** true → panel-kaynak filtresini atla; workspace'teki TÜM issue'lar (uiFlag showAllIssues). */
  showAllIssues?: boolean
}

function buildRequesterFilter(
  requester: ResolvedRequester,
): Record<string, unknown> {
  if (requester.kind === "linear") {
    return {
      or: [
        { creator: { id: { eq: requester.linearUserId } } },
        { assignee: { id: { eq: requester.linearUserId } } },
      ],
    }
  }
  // Proxy sahipliği: "App User: {sub}" satırı yalnız buildProxyHeader'ın proxy
  // atıf bloğunda bulunur — hem panel-kaynağını hem sahipliği tek başına
  // kanıtlar ve takımlar-arası taşımaya dayanır (etiketin aksine). Panel-kaynağı
  // ayrıca listIssues'taki panelFilter ile de AND'lenir.
  return {
    description: { contains: `App User: ${requester.appUserId}` },
  }
}

/**
 * "Bu kullanıcının panelden gönderdiği talepler" filtresi — Inbox için.
 * Kimlik atıf bloğundan gelir (creator kullanılamaz: createAsUser kapalı
 * olduğundan tüm panel talepleri API-key sahibinin adına oluşur):
 *  - proxy: `App User: {sub}` (benzersiz, taşımaya dayanıklı).
 *  - linear: atıftaki `(e-posta)` — buildProxyHeader linear dalı bunu yazar.
 * Her ikisi de görünür blockquote içinde olduğundan round-trip + takım
 * taşımasına dayanır.
 */
function buildOwnerFilter(
  ctx: LinearContext,
  requester: ResolvedRequester,
): Record<string, unknown> {
  // Birincil: panel attachment'ının subtitle'ı (= e-posta) — yapısal,
  // taşımaya/round-trip'e dayanıklı. Fallback: atıftaki kimlik (eski talepler
  // ya da e-postasız proxy için). E-posta yoksa attachment-dalını atla
  // (boş subtitle eşleşmesi kullanıcıları karıştırmasın).
  const attributionOwner =
    requester.kind === "proxy"
      ? { description: { contains: `App User: ${requester.appUserId}` } }
      : { description: { contains: `(${requester.email})` } }
  if (!requester.email) return attributionOwner
  return {
    or: [
      {
        attachments: {
          some: {
            title: { eq: ctx.panelLabelName },
            subtitle: { eq: requester.email },
          },
        },
      },
      attributionOwner,
    ],
  }
}

/**
 * Panel-kaynağı tespit filtresi. Birincil sinyal yapısal panel ATTACHMENT'ı
 * (title = panel etiketi adı); ardından geriye dönük uyum için etiket, atıf
 * imzası ve legacy işaretçi. Attachment issue'ya bağlıdır → takım taşımasına,
 * açıklama düzenlemesine ve markdown round-trip'ine dayanır.
 */
export function panelSourceFilter(ctx: LinearContext): Record<string, unknown> {
  return {
    or: [
      { attachments: { some: { title: { eq: ctx.panelLabelName } } } },
      { labels: { name: { eq: ctx.panelLabelName } } },
      { description: { contains: ATTRIBUTION_SIGNATURE_LINEAR } },
      { description: { contains: ATTRIBUTION_SIGNATURE_PROXY } },
      { description: { contains: ATTRIBUTION_SIGNATURE_PROXY_LEGACY } },
      { description: { contains: LEGACY_PROXY_HEADER_OPEN } },
    ],
  }
}

function buildStateFilter(
  stateType: ListIssuesArgs["stateType"],
): Record<string, unknown> | null {
  if (!stateType || stateType === "all") return null
  if (stateType === "open") {
    return { state: { type: { nin: ["completed", "canceled"] } } }
  }
  return { state: { type: { in: ["completed", "canceled"] } } }
}

const UNASSIGNED_TOKEN = "__unassigned__"

function buildAssigneeFilter(
  ids: string[] | undefined,
): Record<string, unknown> | null {
  if (!ids || ids.length === 0) return null
  const wantsUnassigned = ids.includes(UNASSIGNED_TOKEN)
  const realIds = ids.filter((id) => id !== UNASSIGNED_TOKEN)
  if (wantsUnassigned && realIds.length === 0) {
    return { assignee: { null: true } }
  }
  if (!wantsUnassigned) {
    return { assignee: { id: { in: realIds } } }
  }
  return {
    or: [
      { assignee: { null: true } },
      { assignee: { id: { in: realIds } } },
    ],
  }
}

function buildLabelFilter(
  ids: string[] | undefined,
): Record<string, unknown> | null {
  if (!ids || ids.length === 0) return null
  return { labels: { id: { in: ids } } }
}

export async function listIssues(
  ctx: LinearContext,
  {
    requester,
    scope = "mine",
    cursor = null,
    pageSize = 25,
    teamId,
    stateType = "all",
    assigneeIds,
    labelIds,
    showAllIssues = false,
  }: ListIssuesArgs,
): Promise<IssuePage> {
  const requesterFilter =
    scope === "workspace" ? null : buildRequesterFilter(requester)
  const stateFilter = buildStateFilter(stateType)
  const teamFilter = teamId ? { team: { id: { eq: teamId } } } : null
  const assigneeFilter = buildAssigneeFilter(assigneeIds)
  const labelFilter = buildLabelFilter(labelIds)
  // Yalnız panelden açılan talepleri döndür. Tespit birden çok sinyale bakar
  // (etiket VEYA atıf imzası VEYA legacy işaretçi) — bkz. panelSourceFilter.
  // showAllIssues açıksa (uiFlag) filtreyi atla → workspace'teki tüm issue'lar.
  const panelFilter = showAllIssues ? null : panelSourceFilter(ctx)

  const ands = [
    requesterFilter,
    stateFilter,
    teamFilter,
    assigneeFilter,
    labelFilter,
    panelFilter,
  ].filter((f): f is Record<string, unknown> => f !== null)
  const filter =
    ands.length === 0 ? {} : ands.length === 1 ? ands[0] : { and: ands }

  const data = await linearGraphQL<ListIssuesResponse>(ctx, LIST_ISSUES_QUERY, {
    filter,
    first: pageSize,
    after: cursor,
    orderBy: "updatedAt",
  })

  // Linear paginationOrderBy yalnız createdAt/updatedAt destekler;
  // sortOrder-bazlı sıralamayı sayfa içinde client-tarafta uygularız.
  // Reorder sonrası optimistic UI bekletmeden yeni sırayı yansıtır.
  const sorted = data.issues.nodes.map(normalize).sort((a, b) => {
    const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER
    const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER
    return sa - sb
  })
  return {
    nodes: sorted,
    pageInfo: data.issues.pageInfo,
  }
}

/**
 * Inbox: oturum açan kullanıcının KENDİ panelden gönderdiği talepler.
 * Sahip filtresi (buildOwnerFilter) + panel-kaynağı; en son güncellenen
 * üstte (Linear orderBy updatedAt — sortOrder ile yeniden sıralamayız,
 * "son aktivite" sırası Inbox için anlamlı).
 */
export async function listInboxIssues(
  ctx: LinearContext,
  {
    requester,
    pageSize = 50,
    cursor = null,
  }: {
    requester: ResolvedRequester
    pageSize?: number
    cursor?: string | null
  },
): Promise<IssuePage> {
  const filter = {
    and: [buildOwnerFilter(ctx, requester), panelSourceFilter(ctx)],
  }
  const data = await linearGraphQL<ListIssuesResponse>(ctx, LIST_ISSUES_QUERY, {
    filter,
    first: pageSize,
    after: cursor,
    orderBy: "updatedAt",
  })
  return {
    nodes: data.issues.nodes.map(normalize),
    pageInfo: data.issues.pageInfo,
  }
}

export type SearchedIssue = {
  id: string
  identifier: string
  title: string
  url: string
  state: IssueState
}

type SearchIssuesResponse = {
  searchIssues: { nodes: SearchedIssue[] }
}

export async function searchIssues(
  ctx: LinearContext,
  term: string,
  limit = 8,
): Promise<SearchedIssue[]> {
  const trimmed = term.trim()
  if (!trimmed) return []
  const data = await linearGraphQL<SearchIssuesResponse>(
    ctx,
    SEARCH_ISSUES_QUERY,
    {
      term: trimmed,
      first: Math.max(1, Math.min(20, limit)),
    },
  )
  return data.searchIssues?.nodes ?? []
}

export async function getIssue(
  ctx: LinearContext,
  id: string,
): Promise<{
  issue: Issue
  comments: IssueComment[]
  attachments: IssueAttachment[]
  history: IssueHistoryEvent[]
  children: IssueChildRef[]
} | null> {
  const data = await linearGraphQL<IssueByIdResponse>(ctx, ISSUE_BY_ID_QUERY, {
    id,
  })
  if (!data.issue) return null
  const { comments, attachments, history, children, ...rest } = data.issue
  const teamId = rest.team.id

  // Linear can occasionally return a null connection (permission edge
  // cases, archived parents, etc). Treat every list as optional so the
  // page renders even when a sub-resource is missing.
  const commentNodes = comments?.nodes ?? []
  const attachmentNodes = attachments?.nodes ?? []
  const historyNodes = history?.nodes ?? []
  const childNodes = children?.nodes ?? []

  // Map labelId arrays in history to label objects via the team-labels cache
  // so we can show "X labelı eklendi" without a per-event query.
  let labelMap: Map<string, IssueLabel> | null = null
  const needsLabels = historyNodes.some(
    (h) =>
      (h.addedLabelIds?.length ?? 0) > 0 ||
      (h.removedLabelIds?.length ?? 0) > 0,
  )
  if (needsLabels) {
    const teamLabels = await getTeamLabels(ctx, teamId).catch(() => [])
    labelMap = new Map(teamLabels.map((l) => [l.id, l]))
  }
  const resolveLabels = (ids: string[] | null | undefined): IssueLabel[] => {
    if (!ids || ids.length === 0 || !labelMap) return []
    return ids
      .map((id) => labelMap!.get(id))
      .filter((l): l is IssueLabel => Boolean(l))
  }

  return {
    issue: normalize(rest),
    comments: commentNodes.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      user: c.user,
      parentId: c.parent?.id ?? null,
    })),
    children: childNodes,
    attachments: attachmentNodes,
    history: historyNodes.map((h) => ({
      id: h.id,
      createdAt: h.createdAt,
      actor: h.actor,
      fromState: h.fromState,
      toState: h.toState,
      fromAssignee: h.fromAssignee,
      toAssignee: h.toAssignee,
      fromPriority: h.fromPriority,
      toPriority: h.toPriority,
      fromTitle: h.fromTitle,
      toTitle: h.toTitle,
      addedLabels: resolveLabels(h.addedLabelIds),
      removedLabels: resolveLabels(h.removedLabelIds),
      archived: h.archived,
    })),
  }
}

export type IssueStateSummary = {
  id: string
  identifier: string
  title: string
  url: string
  state: IssueState
}

/**
 * Birden çok issue'nun canlı durumunu tek sorguda çeker.
 * issueId → özet. Bulunamayan/silinmiş id'ler haritada yer almaz.
 */
export async function getIssueStates(
  ctx: LinearContext,
  ids: string[],
): Promise<Map<string, IssueStateSummary>> {
  const out = new Map<string, IssueStateSummary>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out
  const data = await linearGraphQL<{ issues: { nodes: IssueStateSummary[] } }>(
    ctx,
    ISSUE_STATES_QUERY,
    { ids: unique },
  )
  for (const n of data.issues?.nodes ?? []) out.set(n.id, n)
  return out
}

export type AddAttachmentArgs = {
  issueId: string
  url: string
  title?: string
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, "")
    if (path && path !== "/") {
      const last = path.split("/").filter(Boolean).pop()
      if (last) return decodeURIComponent(last)
    }
    return u.hostname
  } catch {
    return "Bağlantı"
  }
}

export async function addAttachment(
  ctx: LinearContext,
  { issueId, url, title }: AddAttachmentArgs,
): Promise<IssueAttachment> {
  // Linear's older `attachmentLinkURL` rejects null/empty titles in some
  // workspaces (and returns a generic 200 + success:false). Use the
  // more permissive `attachmentCreate` with a guaranteed title.
  const finalTitle = title?.trim() || titleFromUrl(url)
  const created = await linearGraphQL<AttachmentCreateResponse>(
    ctx,
    ATTACHMENT_CREATE_MUTATION,
    {
      input: { issueId, url, title: finalTitle },
    },
    // Kayıt yaratır (non-idempotent): timeout sonrası retry duplicate açar.
    { retry: false },
  )
  if (
    !created.attachmentCreate.success ||
    !created.attachmentCreate.attachment
  ) {
    throw new LinearError("Linear attachmentCreate başarısız")
  }
  return created.attachmentCreate.attachment
}

type AttachmentCreateResponse = {
  attachmentCreate: {
    success: boolean
    attachment: IssueAttachment | null
  }
}

export type UploadAttachmentArgs = {
  issueId: string
  file: File
  title?: string
}

/**
 * Linear's official two-step upload:
 *   1) request a signed PUT URL via fileUpload mutation
 *   2) PUT the bytes from our server (avoids browser CORS w/ Linear S3)
 *   3) bind the resulting assetUrl to the issue via attachmentCreate
 */
export async function uploadAttachmentFile(
  ctx: LinearContext,
  { issueId, file, title }: UploadAttachmentArgs,
): Promise<IssueAttachment> {
  // Dosyayı aktif depolama sağlayıcısına yükle (Sentroy → public CDN URL ya
  // da Linear). Attachment KAYDI yine Linear'da yaşar; yalnız işaret ettiği
  // URL sağlayıcıya göre değişir.
  const uploaded = await uploadToStorage(ctx.companyId, file, {
    makePublic: false,
  })

  // Linear's AttachmentCreateInput does NOT accept `contentType`; keep mime
  // info in subtitle.
  const subtitle = `${uploaded.contentType} · ${formatBytes(file.size)}`
  const created = await linearGraphQL<AttachmentCreateResponse>(
    ctx,
    ATTACHMENT_CREATE_MUTATION,
    {
      input: {
        issueId,
        url: uploaded.url,
        title: title?.trim() || file.name,
        subtitle,
      },
    },
    // Kayıt yaratır (non-idempotent): timeout sonrası retry duplicate açar.
    { retry: false },
  )
  if (
    !created.attachmentCreate.success ||
    !created.attachmentCreate.attachment
  ) {
    throw new LinearError("Linear attachmentCreate başarısız")
  }
  return created.attachmentCreate.attachment
}

type IssueUpdateResponse = {
  issueUpdate: {
    success: boolean
    issue: { id: string; state: IssueState } | null
  }
}

export async function updateIssueState(
  ctx: LinearContext,
  {
    issueId,
    stateId,
  }: {
    issueId: string
    stateId: string
  },
): Promise<IssueState> {
  const data = await linearGraphQL<IssueUpdateResponse>(
    ctx,
    ISSUE_UPDATE_STATE_MUTATION,
    { id: issueId, stateId },
  )
  if (!data.issueUpdate.success || !data.issueUpdate.issue) {
    throw new LinearError("Linear issueUpdate başarısız")
  }
  return data.issueUpdate.issue.state
}

export type IssueUpdatePatch = {
  stateId?: string
  priority?: IssuePriority
  labelIds?: string[]
  title?: string
  description?: string
  parentId?: string | null
  assigneeId?: string | null
  sortOrder?: number
}

export async function updateIssue(
  ctx: LinearContext,
  {
    issueId,
    patch,
  }: {
    issueId: string
    patch: IssueUpdatePatch
  },
): Promise<void> {
  if (Object.keys(patch).length === 0) return
  const data = await linearGraphQL<{
    issueUpdate: { success: boolean }
  }>(ctx, ISSUE_UPDATE_MUTATION, { id: issueId, input: patch })
  if (!data.issueUpdate.success) {
    throw new LinearError("Linear issueUpdate başarısız")
  }
}

export async function updateComment(
  ctx: LinearContext,
  {
    commentId,
    body,
  }: {
    commentId: string
    body: string
  },
): Promise<void> {
  const data = await linearGraphQL<{
    commentUpdate: { success: boolean }
  }>(ctx, COMMENT_UPDATE_MUTATION, { id: commentId, body })
  if (!data.commentUpdate.success) {
    throw new LinearError("Linear commentUpdate başarısız")
  }
}

export async function deleteComment(
  ctx: LinearContext,
  commentId: string,
): Promise<void> {
  const data = await linearGraphQL<{
    commentDelete: { success: boolean }
  }>(ctx, COMMENT_DELETE_MUTATION, { id: commentId })
  if (!data.commentDelete.success) {
    throw new LinearError("Linear commentDelete başarısız")
  }
}

export async function archiveIssue(
  ctx: LinearContext,
  issueId: string,
): Promise<void> {
  const data = await linearGraphQL<{
    issueArchive: { success: boolean }
  }>(ctx, ISSUE_ARCHIVE_MUTATION, { id: issueId })
  if (!data.issueArchive.success) {
    throw new LinearError("Linear issueArchive başarısız")
  }
}

export type IssueRelationType = "blocks" | "related" | "duplicate"

export async function createIssueRelation(
  ctx: LinearContext,
  {
    issueId,
    relatedIssueId,
    type,
  }: {
    issueId: string
    relatedIssueId: string
    type: IssueRelationType
  },
): Promise<void> {
  const data = await linearGraphQL<{
    issueRelationCreate: { success: boolean }
  }>(
    ctx,
    ISSUE_RELATION_CREATE_MUTATION,
    {
      input: { issueId, relatedIssueId, type },
    },
    // Kayıt yaratır (non-idempotent): retry duplicate ilişki açabilir.
    { retry: false },
  )
  if (!data.issueRelationCreate.success) {
    throw new LinearError("Linear issueRelationCreate başarısız")
  }
}

export type RelatedKind =
  | "issue"
  | "sub"
  | "parent"
  | "blocking"
  | "blocked"
  | "related"

export type CreateRelatedArgs = {
  requester: ResolvedRequester
  sourceIssueId: string
  kind: RelatedKind
  title: string
  description: string
  priority?: IssuePriority
}

/**
 * Create a new Linear issue and link it to `sourceIssueId`.
 *
 *   "issue"     → independent (no relation)
 *   "sub"       → new is a sub-issue of source (parentId = source)
 *   "parent"    → source becomes child of new (source.parentId = new.id)
 *   "blocking"  → new blocks source        (rel: new --blocks--> source)
 *   "blocked"   → new is blocked by source (rel: source --blocks--> new)
 *   "related"   → soft "related" link      (rel: source --related--> new)
 */
export async function createRelatedIssue(
  ctx: LinearContext,
  {
    requester,
    sourceIssueId,
    kind,
    title,
    description,
    priority,
  }: CreateRelatedArgs,
): Promise<Issue> {
  const newIssue = await createIssue(ctx, {
    requester,
    title,
    description,
    priority,
    parentId: kind === "sub" ? sourceIssueId : undefined,
  })

  if (kind === "parent") {
    // parent ilişkisi doğrudan GraphQL çağrısı ister (IssueUpdatePatch'te
    // parentId var ama triage bu yolu ayrı mutation ile kuruyordu — birebir).
    await linearGraphQL<{ issueUpdate: { success: boolean } }>(
      ctx,
      ISSUE_UPDATE_MUTATION,
      { id: sourceIssueId, input: { parentId: newIssue.id } },
    )
  } else if (kind === "blocking") {
    await createIssueRelation(ctx, {
      issueId: newIssue.id,
      relatedIssueId: sourceIssueId,
      type: "blocks",
    })
  } else if (kind === "blocked") {
    await createIssueRelation(ctx, {
      issueId: sourceIssueId,
      relatedIssueId: newIssue.id,
      type: "blocks",
    })
  } else if (kind === "related") {
    await createIssueRelation(ctx, {
      issueId: sourceIssueId,
      relatedIssueId: newIssue.id,
      type: "related",
    })
  }

  return newIssue
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export type CreateIssueArgs = {
  requester: ResolvedRequester
  title: string
  description: string
  priority?: IssuePriority
  teamId?: string
  labelIds?: string[]
  stateId?: string
  assigneeId?: string
  parentId?: string
  /**
   * Panel attachment metadata'sına eklenecek ek alanlar (geriye-uyumlu).
   * Verilmezse davranış birebir öncekiyle aynıdır.
   */
  extraMetadata?: Record<string, unknown>
}

export async function findLabelIdByName(
  ctx: LinearContext,
  teamId: string,
  labelName: string,
): Promise<string | null> {
  const trimmed = labelName.trim()
  if (!trimmed) return null
  const cacheKey = `${ctx.companyId}:linear:label-byname:${teamId}:${trimmed.toLowerCase()}`
  const cached = cache.get<string>(cacheKey)
  if (cached) return cached
  const data = await linearGraphQL<{
    team: { labels: { nodes: { id: string; name: string }[] } } | null
  }>(
    ctx,
    `query TeamLabelByName($teamId: String!, $name: String!) {
       team(id: $teamId) {
         labels(filter: { name: { eq: $name } }, first: 1) {
           nodes { id name }
         }
       }
     }`,
    { teamId, name: trimmed },
  ).catch(() => null)
  const id = data?.team?.labels?.nodes?.[0]?.id ?? null
  if (id) cache.set(cacheKey, id, TTL.HOUR)
  return id
}

/**
 * Bir takımın workflow state'leri arasında isimle (büyük/küçük harf
 * duyarsız, trim'li) eşleşen state id'sini döndürür. `defaultStateName`
 * ayarını takıma özgü id'ye çözmek için. Zaten cache'li `getTeamStates`
 * üzerinden çalışır; ek istek doğurmaz.
 */
async function findStateIdByName(
  ctx: LinearContext,
  teamId: string,
  stateName: string,
): Promise<string | null> {
  const trimmed = stateName.trim().toLowerCase()
  if (!trimmed) return null
  const states = await getTeamStates(ctx, teamId).catch(() => [])
  const match = states.find((s) => s.name.trim().toLowerCase() === trimmed)
  return match?.id ?? null
}

/**
 * Panel talebine yapısal "kaynak" attachment'ı ekler — tespit ve sahiplik
 * için birincil sinyal. title = panel etiketi adı (panel-kaynağı tespiti),
 * subtitle = e-posta (sahip tespiti; her ikisi de Linear'da filtrelenebilir),
 * url = Linear Lite derin bağlantısı, metadata = zengin makine-okur kayıt.
 * Attachment issue'ya bağlı olduğundan takım taşımasına ve açıklama
 * düzenlemesine dayanır. Başarısız olursa talep yine de açılmış olur
 * ve tespit OR-fallback'lerine (etiket/atıf) düşer — bu yüzden hata yutulur.
 */
async function createPanelAttachment(
  ctx: LinearContext,
  issueId: string,
  requester: ResolvedRequester,
  extraMetadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await linearGraphQL<AttachmentCreateResponse>(
      ctx,
      ATTACHMENT_CREATE_MUTATION,
      {
        input: {
          issueId,
          title: ctx.panelLabelName,
          subtitle: requester.email || undefined,
          url: panelTaskUrl(issueId),
          metadata: {
            v: 1,
            source: "linear-lite-panel",
            companyId: ctx.companyId,
            kind: requester.kind,
            email: requester.email || null,
            appUserId:
              requester.kind === "proxy" ? requester.appUserId : null,
            submittedAt: new Date().toISOString(),
            // Geriye-uyumlu ek alanlar. Verilmezse boş.
            ...(extraMetadata ?? {}),
          },
        },
      },
      // Kayıt yaratır (non-idempotent). url issue içinde benzersiz olduğundan
      // tekrarda Linear dedupe eder ama yine de retry kapalı.
      { retry: false },
    )
  } catch (err) {
    logger.warn({
      source: "linear",
      message:
        "panel attachment oluşturulamadı — tespit etiket/atıf fallback'ine düşer",
      issueId,
      error: (err as Error).message,
    })
  }
}

export async function createIssue(
  ctx: LinearContext,
  {
    requester,
    title,
    description,
    priority = 0,
    teamId,
    labelIds = [],
    stateId,
    assigneeId,
    parentId,
    extraMetadata,
  }: CreateIssueArgs,
): Promise<Issue> {
  let resolvedTeamId = teamId ?? ctx.defaultTeamId ?? undefined
  if (!resolvedTeamId) {
    const teams = await getTeams(ctx)
    resolvedTeamId = teams[0]?.id
  }
  if (!resolvedTeamId) {
    throw new Error("No Linear team available to create issue")
  }

  const proxyHeader = buildProxyHeader(requester)
  const fullDescription = `${proxyHeader}\n\n${description}`

  const labels = [...labelIds]
  // NOT: Panel işaretçi etiketi artık EKLENMİYOR. Tespit yapısal panel
  // attachment'ına dayanıyor (createPanelAttachment); etiket takım-seviyesi
  // olduğundan taşımada düşüyordu. Filtre, mevcut etiketli talepler için
  // etiket dalını geriye dönük OR'da tutmaya devam eder.
  const defaultLabelName = ctx.defaultLabelName?.trim()
  if (defaultLabelName) {
    const defaultLabelId = await findLabelIdByName(
      ctx,
      resolvedTeamId,
      defaultLabelName,
    )
    if (defaultLabelId && !labels.includes(defaultLabelId)) {
      labels.push(defaultLabelId)
    }
  }

  const input: Record<string, unknown> = {
    teamId: resolvedTeamId,
    title,
    description: fullDescription,
    priority,
  }
  if (labels.length) input.labelIds = labels
  // stateId açıkça verilmemişse (örn. showStatus=false veya liste
  // hızlı-eklemesi) ve defaultStateName tanımlıysa, o takımda
  // isimle eşleşen başlangıç durumunu uygula. Bulunamazsa stateId
  // göndermeyiz; Linear takımın kendi varsayılan başlangıcını seçer.
  let resolvedStateId = stateId
  if (!resolvedStateId) {
    const defaultStateName = ctx.defaultStateName?.trim()
    if (defaultStateName) {
      resolvedStateId =
        (await findStateIdByName(ctx, resolvedTeamId, defaultStateName)) ??
        undefined
    }
  }
  if (resolvedStateId) input.stateId = resolvedStateId
  if (assigneeId) input.assigneeId = assigneeId
  if (parentId) input.parentId = parentId
  // `createAsUser` (issue'yu başka kullanıcı adına aç) Linear'da yalnızca
  // OAuth uygulaması `actor=app` modunda çalışır; Personal API Key ile
  // gönderilirse "createAsUser used without OAuth actor=app mode" hatası
  // döner. Bizim varsayılan kurulum shared Personal API Key olduğundan
  // bunu actorApp ayarı arkasına alıyoruz (varsayılan kapalı).
  // Kapalıyken atıf zaten description header'ında ("Submitted by …") durur.
  if (requester.kind === "linear" && ctx.actorApp) {
    input.createAsUser = requester.displayName
  }

  const data = await linearGraphQL<CreateIssueResponse>(
    ctx,
    CREATE_ISSUE_MUTATION,
    { input },
    // Kayıt yaratır (non-idempotent): timeout sonrası retry duplicate talep açar.
    { retry: false },
  )
  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error("Linear issueCreate failed")
  }
  const created = normalize(data.issueCreate.issue)
  // Yapısal panel kaydı — tespit/sahiplik için birincil sinyal (etiket/atıf
  // artık yalnız geriye dönük fallback). Hata yutulur (içeride loglanır).
  await createPanelAttachment(ctx, created.id, requester, extraMetadata)
  return created
}

export type AddCommentArgs = {
  issueId: string
  requester: ResolvedRequester
  body: string
  parentId?: string | null
}

export async function addComment(
  ctx: LinearContext,
  { issueId, requester, body, parentId }: AddCommentArgs,
): Promise<IssueComment> {
  const header =
    requester.kind === "linear"
      ? `> from **${requester.displayName}**\n`
      : `> from **${requester.displayName}** (proxy / App User: ${requester.appUserId})\n`
  const input: Record<string, unknown> = {
    issueId,
    body: `${header}\n${body}`,
  }
  if (parentId) input.parentId = parentId
  const data = await linearGraphQL<CreateCommentResponse>(
    ctx,
    CREATE_COMMENT_MUTATION,
    { input },
    // Kayıt yaratır (non-idempotent): timeout sonrası retry duplicate yorum açar.
    { retry: false },
  )
  if (!data.commentCreate.success || !data.commentCreate.comment) {
    throw new Error("Linear commentCreate failed")
  }
  return data.commentCreate.comment
}
