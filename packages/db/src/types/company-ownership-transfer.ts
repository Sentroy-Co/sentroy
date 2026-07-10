/**
 * Şirket sahipliği devri — mevcut owner bir üyeye devrederken 6 haneli onay
 * kodu owner'ın e-postasına gider; kod doğrulanınca devir tamamlanır. Kod
 * plaintext saklanmaz (SHA-256 hash), 15 dk TTL, tek-kullanımlık (consumedAt),
 * brute-force için attempts cap'i.
 */
export interface CompanyOwnershipTransfer {
  id: string
  companyId: string
  /** Devri başlatan (mevcut owner) userId. */
  initiatedBy: string
  /** Yeni owner adayı userId. */
  targetUserId: string
  /** Yeni owner adayının CompanyMember id'si (devirde role güncellenir). */
  targetMemberId: string
  codeHash: string
  attempts: number
  expiresAt: Date
  consumedAt: Date | null
  createdAt: Date
}
