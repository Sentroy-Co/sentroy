export interface IpInfo {
  city: string
  region: string
  country: string
  loc: string
  org: string
}

export interface Session {
  id: string
  userId: string
  token: string
  expiresAt: Date
  ipAddress?: string
  userAgent?: string
  ipInfo?: IpInfo
  createdAt: Date
  updatedAt: Date
}
