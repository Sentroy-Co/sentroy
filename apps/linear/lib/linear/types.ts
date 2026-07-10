export type IssuePriority = 0 | 1 | 2 | 3 | 4

export type IssueStateType =
  | "triage"
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled"

export type IssueState = {
  id: string
  name: string
  type: IssueStateType
  color: string
}

export type IssueLabel = {
  id: string
  name: string
  color: string
  parentId?: string | null
  isGroup?: boolean
}

export type IssueUser = {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
}

export type IssueTeam = {
  id: string
  key: string
  name: string
}

export type IssueParentRef = {
  id: string
  identifier: string
  title: string
}

export type IssueChildRef = {
  id: string
  identifier: string
  title: string
  priority: IssuePriority
  state: IssueState
}

export type Issue = {
  id: string
  identifier: string
  title: string
  description: string | null
  priority: IssuePriority
  url: string
  state: IssueState
  team: IssueTeam
  creator: IssueUser | null
  assignee: IssueUser | null
  labels: IssueLabel[]
  parent?: IssueParentRef | null
  createdAt: string
  updatedAt: string
  sortOrder?: number
}

export type IssueComment = {
  id: string
  body: string
  createdAt: string
  user: IssueUser | null
  parentId?: string | null
}

export type IssueAttachment = {
  id: string
  title: string
  subtitle: string | null
  url: string
  createdAt: string
  creator: IssueUser | null
}

export type IssueHistoryEvent = {
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
  addedLabels: IssueLabel[]
  removedLabels: IssueLabel[]
  archived: boolean | null
}

export type IssuePage = {
  nodes: Issue[]
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
}

export type IssueTemplateData = {
  title?: string
  /** Markdown string — eski/legacy Linear template'leri. */
  description?: string
  /**
   * Linear UI yeni template editörü ProseMirror JSON doc döndürür
   * (TipTap ile aynı format). Editör'e doğrudan setContent ile beslenebilir.
   */
  descriptionData?: unknown
  priority?: number
  labelIds?: string[]
  assigneeId?: string
  stateId?: string
}

export type IssueTemplate = {
  id: string
  name: string
  description: string | null
  data: IssueTemplateData | null
}
