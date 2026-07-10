"use client"

import { create } from "zustand"
import {
  putLocalFile,
  getLocalFile,
  deleteLocalFile,
  listLocalFiles,
  type LocalFileRecord,
} from "./local-db"

/**
 * LOCAL-FIRST dosya store'u — library'e bırakılan dosyalar sunucuya
 * GİTMEDEN burada (IndexedDB blob + objectURL) yaşar. local-recordings.ts
 * deseninin kalıcı hali: zustand items listesi UI'ı sürer, module-level
 * URL registry'si `media-url.ts` resolver'ına senkron cevap verir.
 *
 * Yaşam döngüsü:
 *   add    → IndexedDB'ye blob + meta, objectURL üret, listeye ekle
 *   init   → sayfa yenilenince IndexedDB'den geri yükle (idempotent)
 *   remove → objectURL revoke + IndexedDB kaydı (blob dahil) silinir
 *   migrate→ cloud'a upload; blob düşer, `migratedTo` tombstone kalır
 *            (başka projelerdeki eski local id referansları CDN'e köprülenir)
 */

export interface LocalFileMeta {
  id: string
  name: string
  mimeType: string
  size: number
  folder: string
  createdAt: string
  durationSec: number | null
  /** Objecturl — Tone/WaveSurfer/fetch doğrudan tüketir. */
  url: string
}

// Module-level registry — media-url resolver'ın senkron okuyabilmesi için
// (zustand state'i de aynı bilgiyi taşır; registry hot-path kestirmesidir).
const urlRegistry = new Map<string, string>()
const migratedRegistry = new Map<string, string>()

/** media-url resolver girişi — aktif blob URL'i VEYA migrate tombstone'u. */
export function getLocalMediaRef(
  id: string,
): { url: string } | { migratedTo: string } | null {
  const url = urlRegistry.get(id)
  if (url) return { url }
  const migrated = migratedRegistry.get(id)
  if (migrated) return { migratedTo: migrated }
  return null
}

/** Bu local id hâlâ bu cihazda blob olarak duruyor mu (upload adayı)? */
export function hasLocalBlob(id: string): boolean {
  return urlRegistry.has(id)
}

/**
 * Audio element metadata'sından süre — full decode YOK, ucuz (~ms).
 * Sıralı import kuyruğunda AWAIT edildiği için sağlamlaştırıldı:
 *   - tek seferlik settle (çift resolve yok)
 *   - 3sn timeout — bozuk/parse edilemeyen dosya kuyruğu kilitlemesin
 *   - cleanup'ta `src = ""` YOK (boş src sayfa URL'ine çözülür ve fazladan
 *     istek/error üretir); removeAttribute + load() ile düzgün abort edilir
 */
function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    let a: HTMLAudioElement
    try {
      a = new Audio()
    } catch {
      resolve(null)
      return
    }
    let settled = false
    let timer = 0
    const finish = (v: number | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      a.onloadedmetadata = null
      a.onerror = null
      try {
        a.removeAttribute("src")
        a.load()
      } catch {}
      resolve(v)
    }
    timer = window.setTimeout(() => finish(null), 3000)
    a.preload = "metadata"
    a.onloadedmetadata = () =>
      finish(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : null)
    a.onerror = () => finish(null)
    a.src = url
  })
}

// Monotonik id sayacı — aynı milisaniyede eklenen dosyalarda Date.now bazlı
// id çakışmasını imkânsız kılar. Çakışma, registry + IndexedDB kaydını
// üzerine yazarak batch'teki İLK dosyanın objectURL eşlemesini kaybettirip
// dosyayı çalınamaz bırakabiliyordu.
let idSeq = 0

interface LocalFilesState {
  /** IndexedDB hydration tamamlandı mı. */
  ready: boolean
  companySlug: string | null
  /** Aktif (migrate edilmemiş) lokal dosyalar. */
  items: LocalFileMeta[]

  init(companySlug: string): Promise<void>
  /** Dosyaları lokal depoya ekle — anında kullanılabilir meta döner. */
  addFiles(files: File[], folder: string): Promise<LocalFileMeta[]>
  patchMeta(
    id: string,
    patch: Partial<{ name: string; folder: string }>,
  ): Promise<void>
  remove(id: string): Promise<void>
}

let initPromise: Promise<void> | null = null

export const useLocalFiles = create<LocalFilesState>((set, get) => ({
  ready: false,
  companySlug: null,
  items: [],

  init(companySlug) {
    // Idempotent — aynı company için tek hydration.
    if (initPromise && get().companySlug === companySlug) return initPromise
    initPromise = (async () => {
      set({ companySlug })
      try {
        const recs = await listLocalFiles(companySlug)
        const items: LocalFileMeta[] = []
        for (const rec of recs) {
          if (rec.migratedTo) {
            migratedRegistry.set(rec.id, rec.migratedTo)
            continue
          }
          if (!rec.blob) continue
          // Reload sonrası objectURL yeniden üretilir (URL'ler kalıcı değil)
          let url = urlRegistry.get(rec.id)
          if (!url) {
            url = URL.createObjectURL(rec.blob)
            urlRegistry.set(rec.id, url)
          }
          items.push({
            id: rec.id,
            name: rec.name,
            mimeType: rec.mimeType,
            size: rec.size,
            folder: rec.folder,
            createdAt: rec.createdAt,
            durationSec: rec.durationSec,
            url,
          })
        }
        // Yeni eklenenler üstte görünsün — createdAt desc
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        set({ items, ready: true })
      } catch {
        // IndexedDB yok/başarısız — lokal özellik sessizce devre dışı
        set({ ready: true })
      }
    })()
    return initPromise
  },

  async addFiles(files, folder) {
    const companySlug = get().companySlug ?? ""
    const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "") || "samples"
    const added: LocalFileMeta[] = []
    // TAM SIRALI kuyruk (BUG FIX — çoklu import'ta ilk dosya çalınamıyordu):
    // eski akışta duration-probe'lar paralel koşup (a) batch state set'iyle
    // yarışıyor (ilk dosyanın patch'i henüz listede olmayan state'e uygulanıp
    // kayboluyordu), (b) IndexedDB'ye ikinci bir yazım yapıyordu ve (c) id
    // üretimi aynı-ms Date.now'a dayanıyordu. Artık her dosya: id (monotonik
    // sayaçlı) → objectURL → süre probe'u (await, 3sn timeout'lu) → tek IDB
    // yazımı → state'e ekleme sırasıyla, bir öncekinden tamamen bağımsız ve
    // ardışık işlenir. Dosya başına maliyet ~ms.
    for (const f of files) {
      idSeq += 1
      const id = `local-${Date.now()}-${idSeq}-${Math.random()
        .toString(36)
        .slice(2, 8)}`
      const url = URL.createObjectURL(f)
      urlRegistry.set(id, url)
      const durationSec = await probeDuration(url)
      const rec: LocalFileRecord = {
        id,
        companySlug,
        blob: f,
        name: f.name,
        mimeType: f.type || "audio/mpeg",
        size: f.size,
        folder: cleanFolder,
        createdAt: new Date().toISOString(),
        durationSec,
      }
      try {
        await putLocalFile(rec)
      } catch {
        // Persist edilemedi (private mode vb.) — yine de session-içi çalışsın
      }
      const meta: LocalFileMeta = {
        id,
        name: rec.name,
        mimeType: rec.mimeType,
        size: rec.size,
        folder: rec.folder,
        createdAt: rec.createdAt,
        durationSec,
        url,
      }
      added.push(meta)
      // Her dosya landıkça listede görünsün (batch bitişini beklemeden)
      set((s) => ({ items: [meta, ...s.items] }))
    }
    return added
  },

  async patchMeta(id, patch) {
    const clean: Partial<{ name: string; folder: string }> = {}
    if (typeof patch.name === "string" && patch.name.trim())
      clean.name = patch.name.trim()
    if (typeof patch.folder === "string")
      clean.folder =
        patch.folder.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/") ||
        "samples"
    if (Object.keys(clean).length === 0) return
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, ...clean } : it)),
    }))
    try {
      const cur = await getLocalFile(id)
      if (cur) await putLocalFile({ ...cur, ...clean })
    } catch {}
  },

  async remove(id) {
    const url = urlRegistry.get(id)
    if (url) {
      try {
        URL.revokeObjectURL(url)
      } catch {}
      urlRegistry.delete(id)
    }
    set((s) => ({ items: s.items.filter((it) => it.id !== id) }))
    // Blob dahil IndexedDB kaydı silinir — lokal veri iz bırakmaz
    try {
      await deleteLocalFile(id)
    } catch {}
  },
}))

/** Editor mount'unda çağrılır — reload sonrası lokal dosyalar geri gelsin. */
export function initLocalFiles(companySlug: string): Promise<void> {
  return useLocalFiles.getState().init(companySlug)
}

/**
 * Lokal dosyayı assets API'siyle cloud'a yükle + tombstone bırak.
 * Başarıda sunucu mediaId döner; lokal blob silinir, `migratedTo` kalır
 * (başka projelerin eski local id referansları CDN'e köprülenir).
 * Hata durumunda throw — caller dosyayı lokal bırakır.
 */
export async function uploadLocalFileToCloud(
  companySlug: string,
  id: string,
): Promise<string> {
  const rec = await getLocalFile(id)
  if (!rec || !rec.blob) throw new Error("Local file not found")
  const form = new FormData()
  form.append(
    "file",
    new File([rec.blob], rec.name, { type: rec.mimeType }),
  )
  form.append("folder", rec.folder || "samples")
  const res = await fetch(`/api/companies/${companySlug}/studio/assets`, {
    method: "POST",
    credentials: "include",
    body: form,
  })
  if (!res.ok) throw new Error(`Upload HTTP ${res.status}`)
  const json = (await res.json()) as { data?: { mediaId?: string } }
  const serverId = json.data?.mediaId
  if (!serverId) throw new Error("Upload response missing mediaId")

  // Tombstone: blob düşer, köprü kalır
  try {
    await putLocalFile({ ...rec, blob: undefined, migratedTo: serverId })
  } catch {}
  const url = urlRegistry.get(id)
  if (url) {
    try {
      URL.revokeObjectURL(url)
    } catch {}
    urlRegistry.delete(id)
  }
  migratedRegistry.set(id, serverId)
  useLocalFiles.setState((s) => ({
    items: s.items.filter((it) => it.id !== id),
  }))
  return serverId
}
