export interface Coupon {
  id: string
  code: string
  discountPercent: number
  maxUses: number
  usedCount: number
  validUntil: Date
  applicablePlanIds: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
