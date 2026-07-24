import type { StorageAccess } from "./storage-access"

export type MediaType = "image" | "video" | "audio" | "document" | "other"

export interface MediaThumbnail {
  width: number
  height: number
  /** S3 key — silme + transform için rederivesiz erişim. */
  fileName: string
  size: number
}

export interface MediaImageMeta {
  width: number
  height: number
  orientation: "landscape" | "portrait" | "square"
  thumbnails: MediaThumbnail[]
}

/**
 * Single transcoded video rung. Mirrors the CDN-side IVideoVariant
 * shape but uses the same type-package contract image thumbnails do
 * — caller code can iterate either pool with the same fields. The
 * `/f/:mediaId/:height` URL convention pairs height with the rung.
 */
export interface MediaVideoVariant {
  height: number
  width: number
  fileName: string
  size: number
  bitrate?: number
}

export interface MediaVideoMeta {
  width: number
  height: number
  /** Length in seconds. May be 0 if probe failed. */
  duration: number
  variants: MediaVideoVariant[]
}

/**
 * Sentroy Studio DJ editor için CDN-server upload zamanında yazılan
 * audio analizi. `bpm` octave-folded ([70,180]); analiz başarısızsa
 * null — consumer in-browser detector'a düşer.
 */
export interface MediaAudioMeta {
  /** Length in seconds (PCM sample count / sampleRate). */
  duration: number
  /** Detected BPM (folded into [70,180]). null = uncertain. */
  bpm: number | null
  /** Decoded sample rate analyzed at (currently always 22050 Hz). */
  sampleRate: number
  /** Source channel count. */
  channels: number
}

/**
 * Async background-processing state. Currently set only on video
 * uploads that opted into the multi-quality ladder; the field is
 * absent for everything else (image thumbnails ship sync, source
 * uploads with no transcode have nothing to track). UI uses
 * `status !== "completed"` as the "show processing badge" condition.
 */
export interface MediaProcessing {
  status: "queued" | "processing" | "completed" | "failed"
  variantsTotal?: number
  variantsCompleted?: number
  error?: string
  startedAt?: Date
  completedAt?: Date
}

export interface Media {
  id: string
  bucketId: string
  companyId: string
  /**
   * S3 anahtarı `{bucketId}/{fileName}` şeklinde saklanır. Burada sadece
   * bucket içindeki benzersiz dosya adı tutulur — bucketId prefix'i client
   * tarafında veya S3 servisinde eklenir.
   */
  fileName: string
  originalName: string
  type: MediaType
  size: number
  mimeType: string
  folder: string
  /**
   * Yükleyen kullanıcının auth user id'si. Multi-tenancy için
   * companyId birincil filtre; uploadedBy sadece audit.
   */
  uploadedBy: string
  tags: string[]
  alt?: string
  caption?: string
  isPublic: boolean
  /**
   * Şirket-içi erişim kapsamı — `isPublic`'ten AYRI eksen (bkz.
   * types/storage-access.ts). Legacy doc'larda alan yoktur → sorgular ve UI
   * bunu `everyone` kabul eder. "owner" tier'ında yükleyen (`uploadedBy`)
   * dışında kimse (yöneticiler dahil) göremez.
   */
  access?: StorageAccess
  /**
   * Kişi-bazlı paylaşım grant listesi (auth user id) — "X seninle paylaştı"
   * akışı. access tier'ı kullanıcıyı dışarıda bıraksa bile bu listedeki
   * kullanıcı dosyayı görür (canViewItem + liste filtresi bunu OR'lar).
   * Drive/Instagram mantığı: dosyayı tüm tier'a açmadan tek kişiye ver.
   */
  sharedWith?: string[]
  imageMeta?: MediaImageMeta
  videoMeta?: MediaVideoMeta
  audioMeta?: MediaAudioMeta
  processing?: MediaProcessing
  /**
   * Bucket icindeki kullanici-tanimli sira. Set edildiyse list'lerde
   * `displayOrder ASC` ile siralanir; set edilmediyse `createdAt DESC`
   * fallback'ine duser. Mevcut bucket'lar (geriye uyumlu) `null` kalir,
   * createdAt order'i degismez.
   */
  displayOrder?: number
  createdAt: Date
  updatedAt: Date
}
