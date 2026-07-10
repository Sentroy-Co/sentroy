"use client"

/**
 * IndexedDB tabanlı lokal depo — LOCAL-FIRST mimarinin temeli.
 *
 * local-recordings.ts'in in-memory blob + objectURL deseninin kalıcı hali:
 * blob'lar IndexedDB'de saklanır, sayfa yenilense de geri gelir.
 *
 * DB: `sentroy-studio-local` v1, iki store:
 *   - `files`    — library'e bırakılan ses dosyaları (blob + meta).
 *                  Cloud'a migrate edilince blob düşer, `migratedTo`
 *                  tombstone'u kalır (diğer projelerdeki eski local id
 *                  referansları sunucu mediaId'sine köprülenir).
 *   - `projects` — proje tree snapshot'ları (default lokal auto-save).
 *                  `cloudSync` bayrağı sunucuya da yazılıp yazılmayacağını
 *                  belirler; lokal kayıt her durumda anlık yedektir.
 *
 * Tüm fonksiyonlar promise döner ve IndexedDB yoksa (SSR/eski browser)
 * reject eder — caller'lar try/catch ile sessiz degrade eder.
 */

const DB_NAME = "sentroy-studio-local"
const DB_VERSION = 1
const FILES_STORE = "files"
const PROJECTS_STORE = "projects"

export interface LocalFileRecord {
  /** `local-<ts>-<rand>` — mediaId yerine geçer (media-url resolver tanır). */
  id: string
  companySlug: string
  /** Ses içeriği — cloud'a migrate edilince silinir (tombstone kalır). */
  blob?: Blob
  name: string
  mimeType: string
  size: number
  folder: string
  createdAt: string
  durationSec: number | null
  /** Cloud'a yüklendiyse sunucu mediaId'si — referans köprüsü. */
  migratedTo?: string
}

export interface LocalProjectRecord {
  projectId: string
  companySlug: string
  title: string
  mode: "dj" | "musician"
  bpm: number
  /** Proje tree snapshot'ı (StudioMusicianProjectTree / DJ tree). */
  tree: unknown
  /** true → kayıtlar sunucuya DA gider; false → yalnız bu cihaz. */
  cloudSync: boolean
  /** Epoch ms — sunucu updatedAt'iyle karşılaştırma için. */
  updatedAt: number
  lastSyncedAt?: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      dbPromise = null
      reject(new Error("IndexedDB unavailable"))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const s = db.createObjectStore(FILES_STORE, { keyPath: "id" })
        s.createIndex("companySlug", "companySlug", { unique: false })
      }
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const s = db.createObjectStore(PROJECTS_STORE, { keyPath: "projectId" })
        s.createIndex("companySlug", "companySlug", { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error("IndexedDB open failed"))
    }
  })
  return dbPromise
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"))
  })
}

async function idbPut(store: string, value: unknown): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, "readwrite")
  await reqToPromise(tx.objectStore(store).put(value))
}

async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb()
  const tx = db.transaction(store, "readonly")
  return reqToPromise(tx.objectStore(store).get(key)) as Promise<T | undefined>
}

async function idbDelete(store: string, key: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, "readwrite")
  await reqToPromise(tx.objectStore(store).delete(key))
}

async function idbListByCompany<T>(
  store: string,
  companySlug: string,
): Promise<T[]> {
  const db = await openDb()
  const tx = db.transaction(store, "readonly")
  const idx = tx.objectStore(store).index("companySlug")
  return reqToPromise(idx.getAll(companySlug)) as Promise<T[]>
}

// ─── Files ────────────────────────────────────────────────────────────────

export const putLocalFile = (rec: LocalFileRecord) => idbPut(FILES_STORE, rec)
export const getLocalFile = (id: string) =>
  idbGet<LocalFileRecord>(FILES_STORE, id)
/** Blob dahil kayıt tamamen silinir — lokal veri iz bırakmaz. */
export const deleteLocalFile = (id: string) => idbDelete(FILES_STORE, id)
export const listLocalFiles = (companySlug: string) =>
  idbListByCompany<LocalFileRecord>(FILES_STORE, companySlug)

// ─── Projects ─────────────────────────────────────────────────────────────

export const putLocalProject = (rec: LocalProjectRecord) =>
  idbPut(PROJECTS_STORE, rec)
export const getLocalProject = (projectId: string) =>
  idbGet<LocalProjectRecord>(PROJECTS_STORE, projectId)
export const deleteLocalProject = (projectId: string) =>
  idbDelete(PROJECTS_STORE, projectId)
export const listLocalProjects = (companySlug: string) =>
  idbListByCompany<LocalProjectRecord>(PROJECTS_STORE, companySlug)
