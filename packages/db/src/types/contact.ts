export type ContactStatus = "active" | "unsubscribed" | "bounced"

export interface Contact {
  id: string
  companyId: string
  email: string
  name?: string
  metadata: Record<string, unknown>
  tags: string[]
  status: ContactStatus
  lastEmailedAt?: Date
  createdAt: Date
  updatedAt: Date
}
