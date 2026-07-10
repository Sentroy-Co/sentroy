export interface AuditLog {
  id: string
  userId: string
  companyId?: string
  action: string
  resource: string
  resourceId?: string
  details: Record<string, unknown>
  ipAddress?: string
  createdAt: Date
}
