import { hashPassword } from "better-auth/crypto"
import { ObjectId } from "mongodb"
import { getDb } from "@workspace/db/client"
import { auth } from "@workspace/auth/server/auth"

/**
 * Better-auth mongo-adapter `account.userId`'yi ObjectId olarak saklar
 * (schema'da `references: { model: "user", field: "id" }` foreign-key
 * tanımı var → adapter `serializeID` ile string → ObjectId coerce eder).
 *
 * Sign-in `$lookup` join'i `user._id` (ObjectId) ↔ `account.userId`
 * arasında. Eğer `userId` string yazılırsa MongoDB type-coerce yapmaz,
 * join boş döner → "INVALID_EMAIL_OR_PASSWORD".
 *
 * Tarihsel olarak bu modülün ilk sürümleri string userId yazıyordu;
 * `healAccountUserIdReference` o eski kayıtları opportunistik olarak
 * ObjectId'e çevirir — mailbox password change ya da yeniden create
 * tetiklendiğinde otomatik düzelir.
 */
async function healAccountUserIdReference(
  db: Awaited<ReturnType<typeof getDb>>,
  userObjectId: ObjectId,
): Promise<void> {
  const userIdString = userObjectId.toString()
  const result = await db.collection("account").updateMany(
    { userId: userIdString, providerId: "credential" },
    { $set: { userId: userObjectId } },
  )
  if (result.modifiedCount > 0) {
    console.warn(
      `[admin-password] healed ${result.modifiedCount} account doc(s) ` +
        `for user ${userIdString}: userId string → ObjectId`,
    )
  }
}

/**
 * Admin-tarafı user yaratma + parola sıfırlama helper'ları. better-auth
 * `setPassword` API'si caller'ın session'ı için çalışır (kendi parolasını
 * değiştirir); admin başka user için **direkt MongoDB**'deki `account`
 * koleksiyonuna scrypt hash yazar (better-auth/crypto.hashPassword ile).
 *
 * Use case: mailbox create akışında otomatik user account oluşturma,
 * mailbox password change'de auth password sync.
 */

export interface CreateUserResult {
  user: { id: string; email: string; name: string }
  /** True ise email zaten kayıtlı; password EZİLMEDİ. */
  alreadyExisted: boolean
}

/**
 * E-posta + parola ile yeni user oluştur. Email zaten varsa mevcut user'ı
 * döner ve `alreadyExisted: true` flag'ini set eder — parola **ezilmez**
 * (mevcut user'ın güvenliği).
 *
 * Idempotent: aynı email ile tekrar çağırılırsa duplicate yaratmaz.
 *
 * `emailVerified: true` set edilir → mailbox owner direkt login olabilir,
 * verification email akışına takılmaz. Audit notu mailbox create
 * handler'ında yazılır.
 */
export async function createUserWithEmail(input: {
  email: string
  password: string
  name?: string
}): Promise<CreateUserResult> {
  const db = await getDb()
  const email = input.email.trim().toLowerCase()
  const name = input.name?.trim() || email.split("@")[0] || "User"

  const existing = (await db.collection("user").findOne({ email })) as
    | { _id: ObjectId; email: string; name: string; emailVerified?: boolean }
    | null
  if (existing) {
    // Önceki kötü-yazılmış (string userId'li) account doc'larını
    // ObjectId'e geri al — yeni mailbox create'i tetiklendiğinde
    // mevcut user'ın login'i de düzelir.
    await healAccountUserIdReference(db, existing._id)
    // Mailbox create admin-driven bir aksiyon — admin bu kullanıcıya
    // gerçek bir mailbox açıyor, e-posta sahipliği zaten kanıtlanmış
    // sayılır. `emailVerified` false / yoksa true'ya çek; aksi halde
    // user mailbox'ından login deneyince "verify e-posta" prompt'una
    // çakılır (bu fonksiyon zaten yeni user'larda true set ediyor,
    // burada eski user'larda da paritesi sağlanıyor).
    if (!existing.emailVerified) {
      await db.collection("user").updateOne(
        { _id: existing._id },
        { $set: { emailVerified: true, updatedAt: new Date() } },
      )
    }
    return {
      user: {
        id: existing._id.toString(),
        email: existing.email,
        name: existing.name,
      },
      alreadyExisted: true,
    }
  }

  // signUpEmail rate limit + verification token vs çalıştırır; mailbox
  // create akışında bunlar uygunsuz (admin'in açtığı kullanıcıya
  // "verify et" maili gitsin istemiyoruz, yeni hesabı zaten admin biliyor).
  // Direct insert + credential account upsert daha temiz.
  const now = new Date()
  const userInsert = await db.collection("user").insertOne({
    name,
    email,
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
    role: "user",
    status: "active",
    planId: null,
  })

  const userObjectId = userInsert.insertedId
  const userId = userObjectId.toString()
  const hash = await hashPassword(input.password)

  await db.collection("account").insertOne({
    // ObjectId — sign-in `$lookup` user._id ↔ account.userId join'i
    // type-strict, string yazılırsa eşleşmez ve credential bulunamaz.
    userId: userObjectId,
    accountId: userId,
    providerId: "credential",
    password: hash,
    createdAt: now,
    updatedAt: now,
  })

  return {
    user: { id: userId, email, name },
    alreadyExisted: false,
  }
}

/**
 * Email'den user'ı bul + credential account'ının parolasını güncelle.
 * User yoksa veya credential provider'ı yoksa **no-op** (silently skip).
 * Caller mailbox password change'de bunu çağırır — user hesabı yoksa
 * sentroy mail-only kullanıcı, sync gereksiz.
 *
 * Returns: true sync gerçekleşti, false skip.
 */
export async function setUserPasswordByEmail(
  email: string,
  newPassword: string,
): Promise<boolean> {
  const db = await getDb()
  const normalized = email.trim().toLowerCase()
  const user = (await db.collection("user").findOne({ email: normalized })) as
    | { _id: ObjectId }
    | null
  if (!user) return false

  const userObjectId = user._id
  const userIdString = userObjectId.toString()
  const hash = await hashPassword(newPassword)
  // $or ile hem ObjectId hem string userId'yi yakala — eski kayıtlarda
  // string olabilir, yeni doğru olanlarda ObjectId. $set'te userId'yi
  // de ObjectId olarak yaz → bu çağrıdan sonra account doc temiz.
  const result = await db.collection("account").updateOne(
    {
      $or: [{ userId: userObjectId }, { userId: userIdString }],
      providerId: "credential",
    },
    { $set: { userId: userObjectId, password: hash, updatedAt: new Date() } },
  )
  return result.matchedCount > 0
}

/** Audit/UI için email-only user lookup. */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const db = await getDb()
  const user = (await db
    .collection("user")
    .findOne({ email: email.trim().toLowerCase() })) as
    | { _id: ObjectId }
    | null
  return user?._id.toString() ?? null
}

// Tip-only re-export — apps/* katmanında auth import'u tutarlı kalsın.
void auth
