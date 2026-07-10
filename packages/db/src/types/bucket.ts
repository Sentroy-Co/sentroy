export interface Bucket {
  id: string
  companyId: string
  name: string
  slug: string
  description?: string
  isPublic: boolean
  storageUsed: number
  fileCount: number
  createdAt: Date
  updatedAt: Date
}
