export interface SmtpCredential {
  id: string
  companyId: string
  name: string
  username: string
  passwordHash: string
  domainId: string
  isActive: boolean
  lastUsedAt?: Date
  createdAt: Date
  updatedAt: Date
}
