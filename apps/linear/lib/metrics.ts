/**
 * İstatistik hesaplama katmanı — triage `app/routes/metrics.tsx` loader'ının
 * portu (PLAN §3: `metrics/page.tsx` bu modülün üstünde oturur).
 *
 * Davranış birebir: workspace scope'taki TÜM panel talepleri 8×250 sayfalama
 * ile (üst limit 2000 issue) çekilir; totals, haftalık delta, durum/öncelik
 * bucket'ları, top creator/assignee/completer, etiket kullanımı, 30 günlük
 * açılma/tamamlanma timeline'ları, stale listesi ve kişi karneleri hesaplanır.
 *
 * i18n notu: bucket'lardaki `label` alanları client'ta type/priority anahtarı
 * üzerinden çevrilir (`linearLite.metrics.states/priorities`); buradaki
 * değerler yalnız nötr İngilizce fallback'tir.
 */

import { listIssues } from "./linear/issues"
import type { LinearContext } from "./linear/context"
import type { ResolvedRequester } from "./linear/mapping"
import type {
  Issue,
  IssuePriority,
  IssueStateType,
} from "./linear/types"

// ---------------------------------------------------------------------------
// Şekiller (triage Metrics tipiyle birebir)
// ---------------------------------------------------------------------------

export type StateBucket = {
  type: IssueStateType
  label: string
  color: string
  count: number
}

export type PriorityBucket = {
  priority: IssuePriority
  label: string
  swatch: string
  count: number
}

export type Person = {
  key: string
  name: string
  email: string | null
  avatarUrl: string | null
  count: number
}

export type LabelStat = {
  id: string
  name: string
  color: string
  count: number
}

export type TimelinePoint = {
  date: string // YYYY-MM-DD
  count: number
}

export type StaleIssueRef = {
  id: string
  identifier: string
  title: string
  state: { name: string; color: string; type: IssueStateType }
  createdAt: string
  ageHours: number
  assignee: { name: string; avatarUrl: string | null } | null
}

export type RecentIssueRef = {
  id: string
  identifier: string
  title: string
  state: { name: string; color: string }
  createdAt: string
}

export type PersonReport = {
  key: string
  name: string
  email: string | null
  avatarUrl: string | null
  openedTotal: number
  openedThisWeek: number
  openedTimeline: TimelinePoint[]
  assignedTotal: number
  assignedOpen: number
  assignedCompleted: number
  avgCompletionHours: number | null
  topLabels: LabelStat[]
  recentIssues: RecentIssueRef[]
}

export type Metrics = {
  totalIssues: number
  openIssues: number
  completedIssues: number
  weekIssues: number
  prevWeekIssues: number
  avgCompletionHours: number | null
  avgOpenAgeHours: number | null
  states: StateBucket[]
  priorities: PriorityBucket[]
  topCreators: Person[]
  topAssignees: Person[]
  topCompleters: Person[]
  topLabels: LabelStat[]
  /** Günlük açma serisi (son 30 gün). */
  timeline: TimelinePoint[]
  /** Günlük tamamlama serisi (son 30 gün, updatedAt günü kabul). */
  completedTimeline: TimelinePoint[]
  staleIssues: StaleIssueRef[]
  /** email → rapor; dialog tıklamasında lookup için. */
  personReports: Record<string, PersonReport>
}

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

// Label'lar nötr EN fallback — UI client'ta `type` üzerinden çevirir.
const STATE_META: Record<
  IssueStateType,
  { label: string; color: string; order: number }
> = {
  triage: { label: "Triage", color: "#94a3b8", order: 0 },
  backlog: { label: "Backlog", color: "#a3a3a3", order: 1 },
  unstarted: { label: "Todo", color: "#3b82f6", order: 2 },
  started: { label: "In Progress", color: "#eab308", order: 3 },
  completed: { label: "Done", color: "#10b981", order: 4 },
  canceled: { label: "Cancelled", color: "#71717a", order: 5 },
}

const PRIORITY_META: Record<IssuePriority, { label: string; swatch: string }> =
  {
    0: { label: "No priority", swatch: "#a3a3a3" },
    1: { label: "Urgent", swatch: "#ef4444" },
    2: { label: "High", swatch: "#f97316" },
    3: { label: "Medium", swatch: "#eab308" },
    4: { label: "Low", swatch: "#9ca3af" },
  }

// Proxy header'dan adı/email'i çıkar. buildProxyHeader şu formatları yazar:
//   > Submitted by **NAME** (email@x)          (linear hesabı olan)
//   > Submitted: **NAME** (email)              (proxy — güncel imza)
//   > Submitted on behalf of **NAME** (email)  (proxy — legacy talepler)
// Triage'daki pattern yalnız by|on-behalf-of tanıyordu; buradaki mapping.ts
// proxy imzasını "Submitted:"a taşıdığı için o varyant da eklendi.
const PROXY_PATTERN =
  /> Submitted(?: by| on behalf of|:) \*\*([^*]+)\*\* \(([^)]+)\)/i

function extractSubmitter(
  description: string | null,
): { name: string; email: string } | null {
  if (!description) return null
  const match = description.match(PROXY_PATTERN)
  if (!match) return null
  return { name: match[1].trim(), email: match[2].trim() }
}

function dayKey(d: Date): string {
  // YYYY-MM-DD in local time
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

type PersonReportInternal = PersonReport & {
  // Internal-only accumulators, stripped before returning.
  _labelMap: Map<string, LabelStat>
  _openedTimelineMap: Map<string, number>
  _completionDurationMs: number
  _completionSamples: number
  _recentBuffer: RecentIssueRef[]
}

function seedTimelineMap(now: Date): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    m.set(dayKey(d), 0)
  }
  return m
}

// ---------------------------------------------------------------------------
// Hesaplama (triage computeMetrics birebir)
// ---------------------------------------------------------------------------

function computeMetricsFromIssues(issues: Issue[]): Metrics {
  const stateCounts = new Map<IssueStateType, number>()
  const priorityCounts = new Map<IssuePriority, number>()
  const creatorMap = new Map<string, Person>()
  const assigneeMap = new Map<string, Person>()
  const completerMap = new Map<string, Person>()
  const labelMap = new Map<string, LabelStat>()
  const dayMap = new Map<string, number>()
  const completedDayMap = new Map<string, number>()
  const reportMap = new Map<string, PersonReportInternal>()
  const openIssueRefs: StaleIssueRef[] = []

  let openIssues = 0
  let completedIssues = 0
  let completionDurationsMs = 0
  let completionSamples = 0
  let openAgeMsSum = 0
  let openAgeSamples = 0

  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  let weekIssues = 0
  let prevWeekIssues = 0

  // Seed last 30 days so timelines don't have gaps.
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const k = dayKey(d)
    dayMap.set(k, 0)
    completedDayMap.set(k, 0)
  }

  const ensureReport = (
    key: string,
    name: string,
    email: string | null,
    avatarUrl: string | null,
  ): PersonReportInternal => {
    let p = reportMap.get(key)
    if (!p) {
      p = {
        key,
        name,
        email,
        avatarUrl,
        openedTotal: 0,
        openedThisWeek: 0,
        openedTimeline: [],
        assignedTotal: 0,
        assignedOpen: 0,
        assignedCompleted: 0,
        avgCompletionHours: null,
        topLabels: [],
        recentIssues: [],
        _labelMap: new Map(),
        _openedTimelineMap: seedTimelineMap(now),
        _completionDurationMs: 0,
        _completionSamples: 0,
        _recentBuffer: [],
      }
      reportMap.set(key, p)
    } else {
      // Fill in details if first sighting only had partial info.
      if (!p.avatarUrl && avatarUrl) p.avatarUrl = avatarUrl
      if (!p.email && email) p.email = email
      if (name && (!p.name || p.name === p.key)) p.name = name
    }
    return p
  }

  for (const issue of issues) {
    const stateType = issue.state.type
    const isCompleted = stateType === "completed"
    const isCanceled = stateType === "canceled"
    const isOpen = !isCompleted && !isCanceled

    stateCounts.set(stateType, (stateCounts.get(stateType) ?? 0) + 1)

    let createdAt: Date | null = null
    let ageMs = 0
    try {
      createdAt = new Date(issue.createdAt)
      ageMs = now.getTime() - createdAt.getTime()
    } catch {
      // skip
    }

    let completionMs = 0
    if (isCompleted) {
      completedIssues++
      try {
        const completedAt = new Date(issue.updatedAt)
        completionMs = completedAt.getTime() - (createdAt?.getTime() ?? 0)
        if (completionMs > 0) {
          completionDurationsMs += completionMs
          completionSamples++
        }
        if (completedAt >= thirtyDaysAgo) {
          const k = dayKey(completedAt)
          if (completedDayMap.has(k)) {
            completedDayMap.set(k, (completedDayMap.get(k) ?? 0) + 1)
          }
        }
      } catch {
        // skip
      }
    } else if (isOpen) {
      openIssues++
      if (createdAt && ageMs > 0) {
        openAgeMsSum += ageMs
        openAgeSamples++
        openIssueRefs.push({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          state: {
            name: issue.state.name,
            color: issue.state.color,
            type: stateType,
          },
          createdAt: issue.createdAt,
          ageHours: ageMs / (1000 * 60 * 60),
          assignee: issue.assignee
            ? {
                name: issue.assignee.name,
                avatarUrl: issue.assignee.avatarUrl ?? null,
              }
            : null,
        })
      }
    }

    priorityCounts.set(
      issue.priority,
      (priorityCounts.get(issue.priority) ?? 0) + 1,
    )

    // Creator (proxy header > linear creator)
    const submitter = extractSubmitter(issue.description)
    let creatorKey: string | null = null
    let creatorPerson: {
      key: string
      name: string
      email: string | null
      avatarUrl: string | null
    } | null = null
    if (submitter) {
      creatorKey = submitter.email.toLowerCase()
      creatorPerson = {
        key: creatorKey,
        name: submitter.name,
        email: submitter.email,
        avatarUrl: null,
      }
    } else if (issue.creator) {
      creatorKey = issue.creator.email.toLowerCase() || issue.creator.id
      creatorPerson = {
        key: creatorKey,
        name: issue.creator.name,
        email: issue.creator.email || null,
        avatarUrl: issue.creator.avatarUrl ?? null,
      }
    }
    if (creatorKey && creatorPerson) {
      const prev = creatorMap.get(creatorKey)
      if (prev) prev.count++
      else creatorMap.set(creatorKey, { ...creatorPerson, count: 1 })

      // Per-person rapor: opened
      const rep = ensureReport(
        creatorKey,
        creatorPerson.name,
        creatorPerson.email,
        creatorPerson.avatarUrl,
      )
      rep.openedTotal++
      if (createdAt && createdAt >= oneWeekAgo) rep.openedThisWeek++
      if (createdAt && createdAt >= thirtyDaysAgo) {
        const k = dayKey(createdAt)
        if (rep._openedTimelineMap.has(k)) {
          rep._openedTimelineMap.set(
            k,
            (rep._openedTimelineMap.get(k) ?? 0) + 1,
          )
        }
      }
      for (const l of issue.labels) {
        const prev2 = rep._labelMap.get(l.id)
        if (prev2) prev2.count++
        else
          rep._labelMap.set(l.id, {
            id: l.id,
            name: l.name,
            color: l.color,
            count: 1,
          })
      }
      rep._recentBuffer.push({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        state: { name: issue.state.name, color: issue.state.color },
        createdAt: issue.createdAt,
      })
    }

    // Assignee + completer
    if (issue.assignee) {
      const key = issue.assignee.id
      const prev = assigneeMap.get(key)
      if (prev) prev.count++
      else
        assigneeMap.set(key, {
          key,
          name: issue.assignee.name,
          email: issue.assignee.email || null,
          avatarUrl: issue.assignee.avatarUrl ?? null,
          count: 1,
        })

      // Per-person rapor: assignment (key olarak email tercih edilir
      // ki creator ile aynı kişi tek raporda birleşsin; assignee'nin
      // email'i yoksa id fallback).
      const repKey =
        (issue.assignee.email && issue.assignee.email.toLowerCase()) ||
        issue.assignee.id
      const rep = ensureReport(
        repKey,
        issue.assignee.name,
        issue.assignee.email || null,
        issue.assignee.avatarUrl ?? null,
      )
      rep.assignedTotal++
      if (isCompleted) {
        rep.assignedCompleted++
        if (completionMs > 0) {
          rep._completionDurationMs += completionMs
          rep._completionSamples++
        }
      } else if (isOpen) {
        rep.assignedOpen++
      }

      if (isCompleted) {
        const prevC = completerMap.get(repKey)
        if (prevC) prevC.count++
        else
          completerMap.set(repKey, {
            key: repKey,
            name: issue.assignee.name,
            email: issue.assignee.email || null,
            avatarUrl: issue.assignee.avatarUrl ?? null,
            count: 1,
          })
      }
    }

    // Workspace label kullanımı
    for (const l of issue.labels) {
      const prev = labelMap.get(l.id)
      if (prev) prev.count++
      else
        labelMap.set(l.id, {
          id: l.id,
          name: l.name,
          color: l.color,
          count: 1,
        })
    }

    // Genel 30-gün timeline + week buckets
    if (createdAt) {
      if (createdAt >= thirtyDaysAgo) {
        const k = dayKey(createdAt)
        if (dayMap.has(k)) dayMap.set(k, (dayMap.get(k) ?? 0) + 1)
      }
      if (createdAt >= oneWeekAgo) weekIssues++
      else if (createdAt >= twoWeeksAgo) prevWeekIssues++
    }
  }

  const states: StateBucket[] = (Object.keys(STATE_META) as IssueStateType[])
    .map((t) => ({
      type: t,
      label: STATE_META[t].label,
      color: STATE_META[t].color,
      count: stateCounts.get(t) ?? 0,
    }))
    .sort((a, b) => STATE_META[a.type].order - STATE_META[b.type].order)

  const priorities: PriorityBucket[] = (
    [1, 2, 3, 4, 0] as IssuePriority[]
  ).map((p) => ({
    priority: p,
    label: PRIORITY_META[p].label,
    swatch: PRIORITY_META[p].swatch,
    count: priorityCounts.get(p) ?? 0,
  }))

  const topCreators = [...creatorMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const topAssignees = [...assigneeMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const topCompleters = [...completerMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const topLabels = [...labelMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const timeline: TimelinePoint[] = [...dayMap.entries()].map(
    ([date, count]) => ({ date, count }),
  )
  const completedTimeline: TimelinePoint[] = [
    ...completedDayMap.entries(),
  ].map(([date, count]) => ({ date, count }))

  const avgCompletionHours =
    completionSamples > 0
      ? completionDurationsMs / completionSamples / (1000 * 60 * 60)
      : null

  const avgOpenAgeHours =
    openAgeSamples > 0 ? openAgeMsSum / openAgeSamples / (1000 * 60 * 60) : null

  // "Ortalamadan uzun süredir bekleyen" — avg açık-yaşın 1.5×'inden
  // yaşlı olan açık issue'lar, yaşa göre desc sıralı, max 10.
  const staleThresholdHours =
    avgOpenAgeHours !== null ? avgOpenAgeHours * 1.5 : Infinity
  const staleIssues = openIssueRefs
    .filter((r) => r.ageHours >= staleThresholdHours)
    .sort((a, b) => b.ageHours - a.ageHours)
    .slice(0, 10)

  // Per-person raporları finalize et: top labels (5), recent (5),
  // openedTimeline array'i, avgCompletionHours, internal state'leri sil.
  const personReports: Record<string, PersonReport> = {}
  for (const [key, p] of reportMap.entries()) {
    p.topLabels = [...p._labelMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
    p.recentIssues = p._recentBuffer
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
    p.openedTimeline = [...p._openedTimelineMap.entries()].map(
      ([date, count]) => ({ date, count }),
    )
    p.avgCompletionHours =
      p._completionSamples > 0
        ? p._completionDurationMs / p._completionSamples / (1000 * 60 * 60)
        : null
    // Internal'ları temizle (client'a sızmasın).
    delete (p as Partial<PersonReportInternal>)._labelMap
    delete (p as Partial<PersonReportInternal>)._openedTimelineMap
    delete (p as Partial<PersonReportInternal>)._completionDurationMs
    delete (p as Partial<PersonReportInternal>)._completionSamples
    delete (p as Partial<PersonReportInternal>)._recentBuffer
    personReports[key] = p as PersonReport
  }

  return {
    totalIssues: issues.length,
    openIssues,
    completedIssues,
    weekIssues,
    prevWeekIssues,
    avgCompletionHours,
    avgOpenAgeHours,
    states,
    priorities,
    topCreators,
    topAssignees,
    topCompleters,
    topLabels,
    timeline,
    completedTimeline,
    staleIssues,
    personReports,
  }
}

// ---------------------------------------------------------------------------
// Veri çekme + dış API
// ---------------------------------------------------------------------------

/**
 * `listIssues` imza gereği requester ister; `scope: "workspace"` modunda
 * requester filtreye hiç girmez (buildRequesterFilter atlanır). Metrics tüm
 * paneli taradığından gerçek kullanıcıyı çözmek (resolveRequester → Linear
 * user lookup) gereksiz bir API çağrısı olurdu — sentinel değer geçilir.
 */
const METRICS_REQUESTER: ResolvedRequester = {
  kind: "proxy",
  displayName: "metrics",
  email: "",
  appUserId: "__metrics__",
}

async function fetchAllPanelIssues(ctx: LinearContext): Promise<Issue[]> {
  const all: Issue[] = []
  let cursor: string | null = null
  const MAX_PAGES = 8 // 8 × 250 = 2000 issue üst limit (güvenlik)
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await listIssues(ctx, {
      requester: METRICS_REQUESTER,
      scope: "workspace",
      cursor,
      pageSize: 250,
      stateType: "all",
    })
    all.push(...page.nodes)
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break
    cursor = page.pageInfo.endCursor
  }
  return all
}

/**
 * Şirketin panel istatistiklerini hesaplar (fetch + compute).
 * Linear hatalarını fırlatır — sayfa yakalayıp ErrorState gösterir.
 */
export async function computeMetrics(ctx: LinearContext): Promise<Metrics> {
  const issues = await fetchAllPanelIssues(ctx)
  return computeMetricsFromIssues(issues)
}
