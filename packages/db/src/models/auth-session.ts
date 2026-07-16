import { getDb } from "../client"

/**
 * better-auth `session` koleksiyonu üzerinde READ-ONLY yardımcılar.
 * Koleksiyonun sahibi better-auth'tur (yazma/şema yönetimi orada) — burası
 * yalnız push dispatch'in "bu oturum hâlâ canlı mı" sorusunu toplu yanıtlar.
 * (Aynı koleksiyon packages/console/src/handlers/user-sessions.ts'te de
 * doğrudan okunuyor; alanlar: token, userId, expiresAt, createdAt/updatedAt.)
 */
const COLLECTION = "session"

/**
 * Verilen session token'larından hangileri hâlâ canlı (kayıt var VE süresi
 * dolmamış)? Push dispatch, aboneliğin bağlandığı oturum öldüyse (çıkış /
 * revoke / süre dolumu) kaydı temizlemek için kullanır. Tek $in sorgusu.
 */
export async function findLiveTokens(tokens: string[]): Promise<Set<string>> {
  const distinct = [...new Set(tokens.filter(Boolean))]
  if (distinct.length === 0) return new Set()
  const db = await getDb()
  const docs = await db
    .collection(COLLECTION)
    .find(
      { token: { $in: distinct }, expiresAt: { $gt: new Date() } },
      { projection: { token: 1 } },
    )
    .toArray()
  return new Set(docs.map((d) => d.token as string))
}
