/**
 * Sentroy Notes — Apple Notes tarzı kişisel/şirket-kapsamlı notlar. Sentroy OS
 * masaüstünde windowed "Notlar" uygulaması + oradan pinlenen yüzen widget'lar
 * bu modeli tüketir.
 *
 * Notlar `companyId` ile kapsanır ve sosyal postlarla AYNI gizlilik enum'unu
 * (`SocialPostVisibility`) kullanır — okuma filtresi `buildVisibilityFilter`
 * ile paylaşılır. Varsayılan görünürlük `author` (yalnız yazan → özel not);
 * kullanıcı not-başı `members`/`admins`/`public` seçebilir.
 *
 * Editör sosyal post editörüyle (TipTap `RichEditor`) aynıdır: `bodyHtml`
 * sanitize edilmiş zengin HTML, `text` düz-metin kopyası (başlık türetme +
 * arama/snippet), `mentions` etiketlenen kullanıcı/uygulama id'leri.
 */

import type { SocialPostVisibility } from "./social"

/** Not gizlilik seviyesi — sosyal post enum'uyla birebir aynı (tek kaynak). */
export type NoteVisibility = SocialPostVisibility

/** Widget/kart tonu (Apple Notes / sticky-note paleti). */
export type NoteColor =
  | "default"
  | "yellow"
  | "blue"
  | "green"
  | "pink"
  | "purple"

export interface Note {
  id: string
  /** Sahip şirket — tüm okumalar caller'ın üyeliğine + visibility'ye bağlı. */
  companyId: string
  authorUserId: string
  /** `text`'in ilk anlamlı satırından sunucuda türetilir (ayrı başlık input'u
   *  yok — Apple Notes tarzı). Liste + widget başlığı + arama için. */
  title: string
  /** Düz-metin kopyası (snippet/arama/başlık türetme). */
  text: string
  /** TipTap'tan üretilen sanitize edilmiş zengin HTML. null → boş/düz not. */
  bodyHtml: string | null
  /** Mention edilen kullanıcı (`<userId>`) / uygulama (`app:<key>`) id'leri. */
  mentions: string[]
  visibility: NoteVisibility
  color: NoteColor
  /** Yazarın klasörü (per-user). null → "All Notes"/kategorisiz. */
  folderId: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Not klasörü — PER-USER, PER-COMPANY (Apple Notes kişisel klasör mantığı).
 * Kullanıcı kendi notlarını organize eder; paylaşılan notlar "All Notes"ta
 * görünür (başkasının klasörü senin sidebar'ında değil).
 */
export interface NoteFolder {
  id: string
  userId: string
  companyId: string
  name: string
  /** Klasör rengi — not renk paletiyle aynı (`default` = nötr). */
  color?: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Bir kullanıcının masaüstüne pinlediği not widget'ının konumu — PER-USER,
 * PER-COMPANY, PER-NOTE. Cihazlar-arası senkron için sunucuda saklanır
 * (paylaşılan bir notu farklı kullanıcılar bağımsız konumlarda pinleyebilir).
 */
export interface NoteWidgetPlacement {
  id: string
  userId: string
  companyId: string
  noteId: string
  x: number
  y: number
  w: number
  h: number
  updatedAt: Date
}
