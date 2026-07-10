/**
 * Linear workspace kullanıcıları (triage users.server.ts portu, ctx'li).
 * Cache key'leri ctx.companyId ile prefix'lidir — tenant izolasyonu ZORUNLU.
 */

import { cache, TTL } from "../cache"
import { linearGraphQL } from "./client"
import { USERS_QUERY, VIEWER_QUERY } from "./queries"
import type { LinearContext } from "./context"
import type { IssueUser } from "./types"

type RawUser = IssueUser & {
  active: boolean
  app?: boolean | null
  guest?: boolean | null
}
type UsersResponse = {
  users: { nodes: RawUser[] }
}
type ViewerResponse = { viewer: IssueUser }

export type EmailUserMap = Map<string, IssueUser>

export async function getAllLinearUsers(
  ctx: LinearContext,
): Promise<IssueUser[]> {
  return cache.wrap(`${ctx.companyId}:linear:users`, TTL.QUARTER_HOUR, async () => {
    const data = await linearGraphQL<UsersResponse>(ctx, USERS_QUERY)
    // Filter out integration bots (Linear "app" users like Cursor/Slack)
    // and guest accounts — they shouldn't show up in the assignee picker.
    return data.users.nodes.filter(
      (u) => u.active && !u.app && !u.guest,
    )
  })
}

export async function getEmailUserMap(
  ctx: LinearContext,
): Promise<EmailUserMap> {
  const users = await getAllLinearUsers(ctx)
  const map: EmailUserMap = new Map()
  for (const u of users) {
    if (u.email) map.set(u.email.toLowerCase(), u)
  }
  return map
}

export async function findLinearUserByEmail(
  ctx: LinearContext,
  email: string,
): Promise<IssueUser | null> {
  const map = await getEmailUserMap(ctx)
  return map.get(email.toLowerCase()) ?? null
}

export async function getViewer(ctx: LinearContext): Promise<IssueUser> {
  return cache.wrap(`${ctx.companyId}:linear:viewer`, TTL.HOUR, async () => {
    const data = await linearGraphQL<ViewerResponse>(ctx, VIEWER_QUERY)
    return data.viewer
  })
}
