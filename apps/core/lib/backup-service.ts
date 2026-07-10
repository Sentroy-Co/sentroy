import { MongoClient, type Document } from "mongodb"

/**
 * Mongo cluster-to-cluster backup/restore servisi.
 *
 * Şu an basit collection-iter kopyalama yapıyor — büyük DB'lerde
 * (>1GB) bu memory'de tüm dökümanları toArray() ile tutmak yerine
 * cursor stream + insertMany batch'leri ile chunked olarak yapılır.
 * Production scale için ileride `mongodump | mongorestore` worker
 * sürecine geçilebilir.
 */

export interface BackupProgress {
  collectionsCopied: number
  totalDocs: number
}

export interface BackupResult extends BackupProgress {
  ok: boolean
  error?: string
}

/** Backup target db ismi — ISO benzeri, dosya sistemi safe. */
export function buildBackupDbName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  return `sentroy-backup-${stamp}`
}

/** Connection URI'den default db ismini çıkar (yoksa fallback).
 *  Caller `MONGODB_DATABASE` env'i açıkça set ettiyse onu öncelikli
 *  geçirir — env explicit set edilmediği zaman URI path'ine düşer.  */
export function getDbNameFromUri(uri: string, fallback = "sentroy"): string {
  // MONGODB_DATABASE explicit env varsa önce ona bak — production'da
  // tek cluster + birden fazla DB (staging/prod) için doğru ayrıştırma.
  const explicit = process.env.MONGODB_DATABASE?.trim()
  if (explicit) return explicit
  try {
    // mongodb://[user:pass@]host[:port]/dbName?opts → path = /dbName
    const u = new URL(uri.replace(/^mongodb\+srv:\/\//, "mongodb://"))
    const path = u.pathname.replace(/^\//, "")
    return path && path !== "/" ? path.split("?")[0] : fallback
  } catch {
    return fallback
  }
}

/**
 * Source mongo'dan tüm user collection'larını okur, target mongo'da
 * yeni bir db'ye yazar. Önce target db'yi siler ki idempotent olsun
 * (retry temiz başlangıç). Index'leri de kopyalar.
 */
export async function runBackup(args: {
  sourceUri: string
  sourceDbName: string
  targetUri: string
  targetDbName: string
  onProgress?: (p: BackupProgress) => void
}): Promise<BackupResult> {
  const { sourceUri, sourceDbName, targetUri, targetDbName, onProgress } = args
  const source = new MongoClient(sourceUri, { serverSelectionTimeoutMS: 10_000 })
  const target = new MongoClient(targetUri, { serverSelectionTimeoutMS: 10_000 })

  let collectionsCopied = 0
  let totalDocs = 0

  try {
    await Promise.all([source.connect(), target.connect()])

    const srcDb = source.db(sourceDbName)
    const tgtDb = target.db(targetDbName)

    // Idempotent: target db'deki eski koleksiyonları sil — retry temiz
    // bir snapshot üretsin.
    const existingTgt = await tgtDb.listCollections().toArray()
    for (const c of existingTgt) {
      await tgtDb.collection(c.name).drop().catch(() => {})
    }

    const collections = await srcDb.listCollections({}, { nameOnly: true }).toArray()
    const userCollections = collections.filter(
      (c) => !c.name.startsWith("system."),
    )

    for (const c of userCollections) {
      const srcCol = srcDb.collection(c.name)
      const tgtCol = tgtDb.collection(c.name)

      // Cursor batch — chunk size 500 ile insertMany.
      const cursor = srcCol.find({}, { batchSize: 500 })
      let batch: Document[] = []
      const flush = async () => {
        if (batch.length === 0) return
        await tgtCol.insertMany(batch, { ordered: false })
        totalDocs += batch.length
        onProgress?.({ collectionsCopied, totalDocs })
        batch = []
      }
      for await (const doc of cursor) {
        batch.push(doc)
        if (batch.length >= 500) await flush()
      }
      await flush()

      // Index'leri kopyala (default _id_ index hariç — Mongo otomatik yaratır).
      try {
        const indexes = await srcCol.indexes()
        for (const idx of indexes) {
          if (idx.name === "_id_") continue
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { v, ns, ...spec } = idx as Record<string, unknown>
          await tgtCol
            .createIndex(spec.key as Record<string, 1 | -1>, {
              name: spec.name as string,
              ...(spec as Record<string, unknown>),
            })
            .catch(() => {})
        }
      } catch {
        // Index copy fail — non-fatal, data zaten yazıldı
      }

      collectionsCopied += 1
      onProgress?.({ collectionsCopied, totalDocs })
    }

    return { ok: true, collectionsCopied, totalDocs }
  } catch (err) {
    return {
      ok: false,
      collectionsCopied,
      totalDocs,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await Promise.allSettled([source.close(), target.close()])
  }
}

/**
 * Restore = backup'ı tersine çalıştır. Backup'taki target db'yi source
 * olarak alır, current MONGODB_URI'yi target olarak yazar. CURRENT DB'Yİ
 * EZER — admin onayı UI'da alınmalı.
 */
export async function runRestore(args: {
  /** Backup'ın yazıldığı uri (kayıttan): backup target = restore source */
  backupUri: string
  backupDbName: string
  /** Geri yazılacak yer: production current cluster + db */
  currentUri: string
  currentDbName: string
  onProgress?: (p: BackupProgress) => void
}): Promise<BackupResult> {
  return runBackup({
    sourceUri: args.backupUri,
    sourceDbName: args.backupDbName,
    targetUri: args.currentUri,
    targetDbName: args.currentDbName,
    onProgress: args.onProgress,
  })
}

/**
 * Mongo db'sini JSON formatında dump'la — collection adı → doküman array.
 * UI download için: tüm db'yi tek JSON'a koymak büyük scale'de memory ağır
 * ama admin export use-case için pragmatik. ObjectId/Date EJSON-style
 * serialization (Mongo native JSON.stringify default'una benzer).
 */
export interface DbDump {
  _meta: {
    sourceDbName: string
    exportedAt: string
    collectionCount: number
    docCount: number
  }
  collections: Record<string, unknown[]>
}

export async function dumpDbToJson(args: {
  uri: string
  dbName: string
}): Promise<DbDump> {
  const client = new MongoClient(args.uri, { serverSelectionTimeoutMS: 10_000 })
  try {
    await client.connect()
    const db = client.db(args.dbName)
    const cols = await db.listCollections({}, { nameOnly: true }).toArray()
    const userCols = cols.filter((c) => !c.name.startsWith("system."))
    const collections: Record<string, unknown[]> = {}
    let docCount = 0
    for (const c of userCols) {
      const docs = await db.collection(c.name).find({}).toArray()
      collections[c.name] = docs
      docCount += docs.length
    }
    return {
      _meta: {
        sourceDbName: args.dbName,
        exportedAt: new Date().toISOString(),
        collectionCount: userCols.length,
        docCount,
      },
      collections,
    }
  } finally {
    await client.close().catch(() => {})
  }
}

/**
 * JSON dump'ı target db'ye yaz. Önce target collection'ları drop eder
 * (idempotent) ki "import" temiz başlasın. Caller import öncesi
 * `runBackup()` ile snapshot almış olmalı (admin endpoint zaten yapıyor).
 *
 * BSON deserialization: JSON.parse Mongo'nun ObjectId/Date'lerini düz
 * string'e çevirmiş olabilir. EJSON parse layer ileride; şu an JSON.parse
 * sonrası gelen object'leri olduğu gibi insert ederiz — _id alanları
 * string olur, fonksiyonel olarak çalışır ama "tam restore" değil. Tam
 * fidelity için EJSON.parse (`bson` package) tercih edilebilir.
 */
export async function applyJsonDump(args: {
  targetUri: string
  targetDbName: string
  dump: DbDump
  onProgress?: (p: BackupProgress) => void
}): Promise<BackupResult> {
  const { targetUri, targetDbName, dump, onProgress } = args
  const client = new MongoClient(targetUri, {
    serverSelectionTimeoutMS: 10_000,
  })
  let collectionsCopied = 0
  let totalDocs = 0
  try {
    await client.connect()
    const db = client.db(targetDbName)
    // Idempotent: target db'deki user collection'larını drop.
    const existing = await db.listCollections().toArray()
    for (const c of existing) {
      if (c.name.startsWith("system.")) continue
      await db.collection(c.name).drop().catch(() => {})
    }
    for (const [name, docs] of Object.entries(dump.collections)) {
      if (!Array.isArray(docs) || docs.length === 0) {
        collectionsCopied += 1
        continue
      }
      // 500-batch insertMany.
      for (let i = 0; i < docs.length; i += 500) {
        const slice = docs.slice(i, i + 500) as Document[]
        await db.collection(name).insertMany(slice, { ordered: false })
        totalDocs += slice.length
        onProgress?.({ collectionsCopied, totalDocs })
      }
      collectionsCopied += 1
      onProgress?.({ collectionsCopied, totalDocs })
    }
    return { ok: true, collectionsCopied, totalDocs }
  } catch (err) {
    return {
      ok: false,
      collectionsCopied,
      totalDocs,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await client.close().catch(() => {})
  }
}

/**
 * URI'den credential'ları maskele — UI'a güvenli şekilde göster.
 * `mongodb+srv://user:pass@host/db` → `mongodb+srv://***@host/db`
 */
export function sanitizeUri(uri: string): string {
  try {
    const u = new URL(uri.replace(/^mongodb\+srv:\/\//, "mongodb://"))
    if (u.username || u.password) {
      u.username = "***"
      u.password = ""
    }
    return u.toString().replace(/^mongodb:\/\//, uri.startsWith("mongodb+srv://") ? "mongodb+srv://" : "mongodb://")
  } catch {
    return uri.replace(/\/\/[^@]+@/, "//***@")
  }
}
