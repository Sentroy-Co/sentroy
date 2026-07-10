export type UserRole = "user" | "admin"
export type UserStatus = "active" | "suspended"

export interface User {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string
  role: UserRole
  status: UserStatus
  planId?: string
  lastLoginAt?: Date
  metadata?: {
    timezone?: string
    locale?: string
    [key: string]: unknown
  }
  createdAt: Date
  updatedAt: Date
}
