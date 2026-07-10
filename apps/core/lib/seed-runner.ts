import { MongoClient } from "mongodb"
import { auth } from "@workspace/auth/server/auth"

/**
 * First-run seed — script ve HTTP setup endpoint için ortak logic.
 *
 * Idempotent: tüm steps "varsa skip" mantığıyla. Aynı seed'i tekrar
 * çalıştırmak veriyi bozmaz, sadece yeni eklenmesi gerekenleri ekler.
 *
 * scripts/seed.ts CLI için (`bun run db:seed`) bu fonksiyonu çağırır;
 * /api/setup/seed endpoint'i de aynısını HTTP arkasında çalıştırır.
 */
export interface SeedResult {
  ok: boolean
  steps: string[]
  error?: string
}

export async function runSeed(args: {
  adminEmail: string
  adminPassword: string
  uri?: string
}): Promise<SeedResult> {
  const uri = args.uri ?? process.env.MONGODB_URI
  if (!uri) {
    return { ok: false, steps: [], error: "MONGODB_URI is not set" }
  }
  // CLI + HTTP endpoint aynı sözleşme: admin e-postası boş olamaz (güvensiz
  // admin@sentroy.com default'u kaldırıldı).
  if (!args.adminEmail?.trim()) {
    return { ok: false, steps: [], error: "adminEmail required" }
  }
  if (!args.adminPassword) {
    return { ok: false, steps: [], error: "adminPassword required" }
  }

  const steps: string[] = []
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(process.env.MONGODB_DATABASE)
    steps.push("Connected to MongoDB")

    // ── Indexes ────────────────────────────────────────────────────────
    await db.collection("companies").createIndex({ slug: 1 }, { unique: true })
    await db.collection("companies").createIndex({ ownerId: 1 })
    await db
      .collection("companies")
      .createIndex({ polarCustomerId: 1 }, { sparse: true })
    await db
      .collection("companies")
      .createIndex({ "subscription.polarSubscriptionId": 1 }, { sparse: true })
    await db
      .collection("polar_events")
      .createIndex({ polarEventId: 1 }, { unique: true })
    await db.collection("polar_events").createIndex({ createdAt: -1 })
    await db
      .collection("company_members")
      .createIndex({ companyId: 1, userId: 1 }, { unique: true })
    await db.collection("company_members").createIndex({ userId: 1 })
    await db.collection("plans").createIndex({ isDefault: 1 })
    await db.collection("plans").createIndex({ isActive: 1 })
    await db.collection("coupons").createIndex({ code: 1 }, { unique: true })
    await db
      .collection("contacts")
      .createIndex({ companyId: 1, email: 1 }, { unique: true })
    await db.collection("contacts").createIndex({ companyId: 1, tags: 1 })
    await db.collection("contact_lists").createIndex({ companyId: 1 })
    await db
      .collection("contact_list_members")
      .createIndex({ listId: 1, contactId: 1 }, { unique: true })
    await db.collection("smtp_credentials").createIndex({ companyId: 1 })
    await db
      .collection("smtp_credentials")
      .createIndex({ username: 1 }, { unique: true })
    await db
      .collection("audit_logs")
      .createIndex({ companyId: 1, createdAt: -1 })
    await db.collection("audit_logs").createIndex({ userId: 1, createdAt: -1 })
    await db
      .collection("newsletter_subscribers")
      .createIndex({ email: 1 }, { unique: true })
    await db.collection("newsletter_subscribers").createIndex({ createdAt: -1 })
    steps.push("Indexes created")

    // ── Plans ──────────────────────────────────────────────────────────
    const existingPlans = await db.collection("plans").countDocuments()
    if (existingPlans === 0) {
      const now = new Date()
      const plans = [
        {
          name: { en: "Free", tr: "Ucretsiz" },
          description: {
            en: "Get started with basic email features",
            tr: "Temel email ozellikleriyle baslayin",
          },
          maxCompanies: 1,
          maxDomainsPerCompany: 1,
          maxMembersPerCompany: 2,
          maxMailboxesPerCompany: 3,
          maxContacts: 500,
          storageLimit: 50,
          trashRetentionDays: 7,
          monthlyEmailLimit: 1000,
          maxWhatsappNumbers: 1,
          maxWhatsappTemplates: 5,
          monthlyWhatsappLimit: 200,
          features: ["email_send", "inbox", "templates"],
          price: 0,
          isDefault: true,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          name: { en: "Pro", tr: "Pro" },
          description: {
            en: "For growing teams with advanced needs",
            tr: "Gelisen ekipler icin gelismis ozellikler",
          },
          maxCompanies: 3,
          maxDomainsPerCompany: 5,
          maxMembersPerCompany: 10,
          maxMailboxesPerCompany: 25,
          maxContacts: 10000,
          storageLimit: 1024,
          trashRetentionDays: 30,
          monthlyEmailLimit: 50000,
          maxWhatsappNumbers: 5,
          maxWhatsappTemplates: 50,
          monthlyWhatsappLimit: 20000,
          features: [
            "email_send",
            "inbox",
            "templates",
            "audience",
            "webhooks",
            "smtp",
            "statistics",
          ],
          price: 2900,
          isDefault: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          name: { en: "Enterprise", tr: "Kurumsal" },
          description: {
            en: "Unlimited power for large organizations",
            tr: "Buyuk organizasyonlar icin sinirsiz guc",
          },
          maxCompanies: 10,
          maxDomainsPerCompany: -1,
          maxMembersPerCompany: -1,
          maxMailboxesPerCompany: -1,
          maxContacts: -1,
          storageLimit: 51200,
          trashRetentionDays: 90,
          monthlyEmailLimit: 500000,
          features: [
            "email_send",
            "inbox",
            "templates",
            "audience",
            "webhooks",
            "smtp",
            "statistics",
            "api_keys",
            "custom_dkim",
            "priority_support",
          ],
          price: 9900,
          isDefault: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ]
      await db.collection("plans").insertMany(plans)
      steps.push(`Plans seeded: ${plans.length}`)
    }

    // ── Admin user (BetterAuth signUp + role promote) ─────────────────
    const existingAdmin = await db
      .collection("user")
      .findOne({ email: args.adminEmail })
    const defaultPlan = await db
      .collection("plans")
      .findOne({ isDefault: true })

    if (!existingAdmin) {
      const result = await auth.api.signUpEmail({
        body: {
          name: "System Admin",
          email: args.adminEmail,
          password: args.adminPassword,
        },
      })
      if (!result.user) {
        throw new Error("Admin sign-up failed")
      }
      steps.push(`Admin user signed up: ${args.adminEmail}`)
    }

    // emailVerified=true + role + plan force-update (her seed çağrısında
    // idempotent). signUp better-auth tarafında emailVerified=false ile
    // user oluşturuyor; ayrıca `sendOnSignUp: true` config'i bir
    // verification token kaydı bırakabiliyor — ikisini de burada
    // temizliyoruz ki seed sonrası ilk login'de EMAIL_NOT_VERIFIED hatası
    // imkânsız olsun.
    await db.collection("user").updateOne(
      { email: args.adminEmail },
      {
        $set: {
          role: "admin",
          status: "active",
          planId: defaultPlan?._id?.toString() || null,
          emailVerified: true,
        },
      },
    )

    // Better-auth'un `verification` collection'ında bu user için bekleyen
    // verify token'ları sil — admin email zaten verified, token gereksiz.
    // Collection yoksa silently skip.
    await db
      .collection("verification")
      .deleteMany({ identifier: args.adminEmail })
      .catch(() => null)

    steps.push(`Admin verified + role=admin: ${args.adminEmail}`)

    return { ok: true, steps }
  } catch (err) {
    return {
      ok: false,
      steps,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await client.close().catch(() => {})
  }
}

/**
 * "DB initialized" check — kullanıcı veya plan kaydı varsa setup tamamlanmış
 * sayılır. /api/setup/status için.
 */
export async function isDbInitialized(): Promise<{
  initialized: boolean
  userCount: number
  planCount: number
}> {
  const uri = process.env.MONGODB_URI
  if (!uri) return { initialized: false, userCount: 0, planCount: 0 }
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db(process.env.MONGODB_DATABASE)
    const [userCount, planCount] = await Promise.all([
      db.collection("user").countDocuments({}),
      db.collection("plans").countDocuments({}),
    ])
    return { initialized: userCount > 0, userCount, planCount }
  } finally {
    await client.close().catch(() => {})
  }
}
