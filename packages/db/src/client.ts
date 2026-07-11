import { MongoClient, Db } from "mongodb"

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

/**
 * MongoDB client — tek bir connection pool, uygulama omru boyunca paylasilir.
 *
 * Next.js'in HMR'i ve Docker'da container restart davranisi yuzunden client'i
 * `globalThis`'te tutmak zorundayiz; aksi halde her modul import'unda yeni
 * bir MongoClient acilir (authentication handshake spamı → CPU şişmesi).
 *
 * Lazy initialization: `MongoClient.connect()` module-level'da değil ilk
 * kullanım anında çağrılır. Next.js production build (`next build`) route
 * module'lerini import ederken bu dosya da import ediliyor; module-level
 * connect build-time'da DB'ye bağlanmaya çalışıp fail oluyordu. Proxy
 * sarmalayıcısı `await clientPromise` veya `.then(...)` çağrısında gerçek
 * promise'i üretir, böylece build-time side effect kalmaz.
 */
function createClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error("MONGODB_URI is not set")
  }
  const client = new MongoClient(uri, {
    maxPoolSize: 20,
    minPoolSize: 2,
    maxIdleTimeMS: 60_000,
  })
  // Eager `.connect()` YOK — mongodb driver ilk operasyonda auto-connect eder.
  // Böylece `await clientPromise` (@workspace/auth'taki better-auth adapter'ı
  // için module-level await dahil) IMPORT anında bağlantı AÇMAZ; bu, ulaşılamaz
  // MONGODB_URI ile `next build` page-data collection'ını kırıyordu (offline/
  // self-host build). Runtime etkilenmez: ilk sorgu bağlanır, paylaşılan havuz
  // (globalThis) tek kalır — connection sayısı artmaz.
  return Promise.resolve(client)
}

function getClientPromise(): Promise<MongoClient> {
  if (!globalThis._mongoClientPromise) {
    globalThis._mongoClientPromise = createClientPromise()
  }
  return globalThis._mongoClientPromise
}

/**
 * `await clientPromise` ve `clientPromise.then(...)` her ikisi de çalışsın
 * diye Proxy: method erişildiğinde gerçek promise'i resolve eder, bağlı
 * fonksiyon döner. Module sadece import edildiğinde hiçbir şey tetiklenmez.
 */
export const clientPromise: Promise<MongoClient> = new Proxy(
  {} as Promise<MongoClient>,
  {
    get(_target, prop) {
      const p = getClientPromise()
      const value = (p as unknown as Record<PropertyKey, unknown>)[prop]
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(p)
        : value
    },
  },
)

/**
 * URI'de db adı gömülü olabilir ama biz `MONGODB_DATABASE` env'ini açıkça
 * tutuyoruz — connection string'i db'den ayırmak credential-rotation ve
 * environment promotion'ı kolaylaştırır (aynı cluster, farklı DB
 * staging/prod). URI'de path varsa onu fallback olarak kullanırız;
 * ikisi de yoksa MongoDB driver default'u (`test`) çalışır ki istenmez —
 * o yüzden boş ise undefined geçilir, driver explicit hata atar.
 */
function getDatabaseName(): string | undefined {
  const explicit = process.env.MONGODB_DATABASE?.trim()
  if (explicit) return explicit
  return undefined
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise()
  return client.db(getDatabaseName())
}
