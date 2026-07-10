export const ISSUE_FRAGMENT = `
  fragment IssueFields on Issue {
    id
    identifier
    title
    description
    priority
    url
    createdAt
    updatedAt
    state { id name type color }
    team { id key name }
    creator { id name email avatarUrl }
    assignee { id name email avatarUrl }
    labels { nodes { id name color } }
    parent { id identifier title }
    sortOrder
  }
`

export const ISSUE_BY_ID_QUERY = `
  query IssueById($id: String!) {
    issue(id: $id) {
      ...IssueFields
      comments(first: 50, orderBy: createdAt) {
        nodes {
          id
          body
          createdAt
          user { id name email avatarUrl }
          parent { id }
        }
      }
      attachments(first: 30) {
        nodes {
          id
          title
          subtitle
          url
          createdAt
          creator { id name email avatarUrl }
        }
      }
      children(first: 50) {
        nodes {
          id
          identifier
          title
          priority
          state { id name type color }
        }
      }
      history(first: 50) {
        nodes {
          id
          createdAt
          actor { id name email avatarUrl }
          fromState { id name color type }
          toState { id name color type }
          fromAssignee { id name email avatarUrl }
          toAssignee { id name email avatarUrl }
          fromPriority
          toPriority
          fromTitle
          toTitle
          addedLabelIds
          removedLabelIds
          archived
        }
      }
    }
  }
  ${ISSUE_FRAGMENT}
`

export const ATTACHMENT_LINK_URL_MUTATION = `
  mutation AttachmentLinkURL($issueId: String!, $url: String!, $title: String) {
    attachmentLinkURL(issueId: $issueId, url: $url, title: $title) {
      success
      attachment {
        id
        title
        subtitle
        url
        createdAt
        creator { id name email avatarUrl }
      }
    }
  }
`

export const ISSUE_UPDATE_STATE_MUTATION = `
  mutation IssueUpdateState($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) {
      success
      issue {
        id
        state { id name color type }
      }
    }
  }
`

export const ISSUE_UPDATE_MUTATION = `
  mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        id
        state { id name color type }
        priority
        labels { nodes { id name color } }
      }
    }
  }
`

export const ISSUE_ARCHIVE_MUTATION = `
  mutation IssueArchive($id: String!) {
    issueArchive(id: $id) {
      success
    }
  }
`

export const COMMENT_UPDATE_MUTATION = `
  mutation CommentUpdate($id: String!, $body: String!) {
    commentUpdate(id: $id, input: { body: $body }) {
      success
      comment { id body updatedAt }
    }
  }
`

export const COMMENT_DELETE_MUTATION = `
  mutation CommentDelete($id: String!) {
    commentDelete(id: $id) { success }
  }
`

export const ISSUE_RELATION_CREATE_MUTATION = `
  mutation IssueRelationCreate($input: IssueRelationCreateInput!) {
    issueRelationCreate(input: $input) {
      success
      issueRelation { id type }
    }
  }
`

export const FILE_UPLOAD_MUTATION = `
  mutation FileUpload(
    $contentType: String!
    $filename: String!
    $size: Int!
    $makePublic: Boolean
  ) {
    fileUpload(
      contentType: $contentType
      filename: $filename
      size: $size
      makePublic: $makePublic
    ) {
      success
      uploadFile {
        uploadUrl
        assetUrl
        contentType
        filename
        size
        headers { key value }
      }
    }
  }
`

export const ATTACHMENT_CREATE_MUTATION = `
  mutation AttachmentCreate($input: AttachmentCreateInput!) {
    attachmentCreate(input: $input) {
      success
      attachment {
        id
        title
        subtitle
        url
        createdAt
        creator { id name email avatarUrl }
      }
    }
  }
`

export const LIST_ISSUES_QUERY = `
  query ListIssues(
    $filter: IssueFilter
    $first: Int!
    $after: String
    $orderBy: PaginationOrderBy
  ) {
    issues(filter: $filter, first: $first, after: $after, orderBy: $orderBy) {
      nodes {
        ...IssueFields
      }
      pageInfo { hasNextPage endCursor }
    }
  }
  ${ISSUE_FRAGMENT}
`

export const TEAMS_QUERY = `
  query Teams {
    teams(first: 50) {
      nodes { id key name }
    }
  }
`

export const TEAM_STATES_QUERY = `
  query TeamStates($teamId: String!) {
    team(id: $teamId) {
      states(first: 50) {
        nodes { id name type color position }
      }
    }
  }
`

export const TEAM_LABELS_QUERY = `
  query TeamLabels($teamId: String!) {
    team(id: $teamId) {
      labels(first: 200) {
        nodes {
          id
          name
          color
          isGroup
          parent { id }
        }
      }
    }
  }
`

export const TEAM_TEMPLATES_QUERY = `
  query TeamTemplates($teamId: String!) {
    team(id: $teamId) {
      templates {
        nodes {
          id
          name
          description
          type
          templateData
        }
      }
    }
  }
`

export const SEARCH_ISSUES_QUERY = `
  query SearchIssues($term: String!, $first: Int!) {
    searchIssues(term: $term, first: $first) {
      nodes {
        id
        identifier
        title
        url
        state { id name type color }
      }
    }
  }
`

export const USERS_QUERY = `
  query Users {
    users(first: 250) {
      nodes { id name email avatarUrl active app guest }
    }
  }
`

export const VIEWER_QUERY = `
  query Viewer { viewer { id name email } }
`

export const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { ...IssueFields }
    }
  }
  ${ISSUE_FRAGMENT}
`

export const CREATE_COMMENT_MUTATION = `
  mutation CreateComment($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment {
        id
        body
        createdAt
        user { id name email avatarUrl }
        parent { id }
      }
    }
  }
`

export const CREATE_LABEL_MUTATION = `
  mutation CreateLabel($input: IssueLabelCreateInput!) {
    issueLabelCreate(input: $input) {
      success
      issueLabel { id name color }
    }
  }
`

// --- Webhook yönetimi (admin tek-tık kayıt) ------------------------------

export const WEBHOOKS_QUERY = `
  query Webhooks {
    webhooks {
      nodes {
        id
        url
        enabled
        resourceTypes
      }
    }
  }
`

export const WEBHOOK_CREATE_MUTATION = `
  mutation WebhookCreate($input: WebhookCreateInput!) {
    webhookCreate(input: $input) {
      success
      webhook { id url enabled resourceTypes }
    }
  }
`

export const WEBHOOK_DELETE_MUTATION = `
  mutation WebhookDelete($id: String!) {
    webhookDelete(id: $id) {
      success
    }
  }
`

/**
 * Birden çok issue'nun yalnız özet + canlı durum bilgisi (Telegram /taleplerim
 * için). Tek sorguda `id in [...]` ile çeker; ağır IssueFields gerekmez.
 */
export const ISSUE_STATES_QUERY = `
  query IssueStates($ids: [ID!]!) {
    issues(filter: { id: { in: $ids } }) {
      nodes {
        id
        identifier
        title
        url
        state { id name type color }
      }
    }
  }
`
