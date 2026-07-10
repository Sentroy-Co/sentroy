import { create } from "zustand"
import {
  widgetDef,
  WIDGET_REGISTRY,
  type DesktopWidgetInstance,
  type DesktopWidgetType,
} from "./registry"
import { queuePrefsPatch } from "../os-prefs-sync"

/**
 * Masaüstü widget instance store'u — şirket (slug) başına + SAYFA İÇİ ANLIK
 * senkron (zustand): widget-layer, galeri ve menü-bar achievements pill'i AYNI
 * store'u okur; ✕ ile kaldırma pill'e anında yansır (storage event beklemez).
 *
 * Kalıcılık: SUNUCU tek kaynak (per-user-per-company, os_preferences.widgets);
 * localStorage `os-desktop-widgets:<slug>` per-slug OFFLINE CACHE. `load()`
 * yerel cache/seed'i ANINDA gösterir (flash yok, mevcut davranış); `syncFromServer()`
 * (useOsPrefsSync mount GET'i çağırır) sunucu verisiyle reconcile eder — sunucu
 * boşsa yerel/seed'i migration için geri döndürür. Mutasyonlar (add/remove/
 * move/setConfig) cache'e yazar + debounced sunucuya PUT eder.
 *
 * İlk yüklemede (kayıt yoksa) tüm erişilebilir widget'lar seed edilir — legacy
 * `os-achievements-widget-hidden` bayrağı "1" ise (eski ✕ davranışı) yalnız
 * clock seed (kullanıcı achievements'ı gizlemişti).
 */

const LS_PREFIX = "os-desktop-widgets:"
/** Legacy achievements gizleme bayrağı — seed migrasyonunda okunur. */
const LEGACY_ACH_HIDDEN_KEY = "os-achievements-widget-hidden"

const MENU_BAR_H = 44
const EDGE = 12
/** Widget'lar arası minimum boşluk (px) — macOS widget snap hissi. */
const GAP = 12

function storageKey(slug: string): string {
  return `${LS_PREFIX}${slug}`
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

function viewport(): { vw: number; vh: number } {
  if (typeof window === "undefined") return { vw: 1440, vh: 900 }
  return { vw: window.innerWidth, vh: window.innerHeight }
}

/**
 * Konumu, widget'ın TAM GENİŞLİK/YÜKSEKLİĞİ görünür alanda kalacak şekilde
 * kırp. Eski kod sabit `vw - 96` kullanıyordu → 300px'lik kart sağ kenardan
 * ~200px taşıyordu (kullanıcı raporu). Artık gerçek boyut hesaba katılır.
 */
function clampPos(
  x: number,
  y: number,
  type: DesktopWidgetType,
): { x: number; y: number } {
  const { vw, vh } = viewport()
  const size = widgetDef(type)?.defaultSize ?? { w: 300, h: 190 }
  return {
    x: clamp(x, EDGE, Math.max(EDGE, vw - size.w - EDGE)),
    y: clamp(y, MENU_BAR_H, Math.max(MENU_BAR_H, vh - size.h - EDGE)),
  }
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function sizeOf(type: DesktopWidgetType): { w: number; h: number } {
  return widgetDef(type)?.defaultSize ?? { w: 300, h: 190 }
}

/** İki dikdörtgen GAP payıyla kesişiyor mu (kenar teması çakışma sayılmaz). */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w + GAP &&
    a.x + a.w + GAP > b.x &&
    a.y < b.y + b.h + GAP &&
    a.y + a.h + GAP > b.y
  )
}

function collides(
  pos: { x: number; y: number },
  size: { w: number; h: number },
  others: Rect[],
): boolean {
  const rect: Rect = { x: pos.x, y: pos.y, w: size.w, h: size.h }
  return others.some((o) => rectsOverlap(rect, o))
}

/** Verilen widget listesinden (id hariç) rect'leri çıkar. */
function otherRects(
  widgets: DesktopWidgetInstance[],
  excludeId?: string,
): Rect[] {
  return widgets
    .filter((w) => w.id !== excludeId)
    .map((w) => ({ x: w.x, y: w.y, ...sizeOf(w.type) }))
}

/**
 * İstenen (x,y) konumunu, `others` widget'larıyla ÇAKIŞMAYAN en yakın boş
 * konuma taşı — macOS widget davranışı (kartlar üst üste binmez). Önce clampPos;
 * çakışma yoksa aynen döner. Çakışıyorsa sırayla: (1) aynı sütunda AŞAĞI, (2)
 * aynı satırda SAĞA ilk boşluk; ikisi de tıkanırsa (3) görünür alanı ızgara
 * tarayıp desired'a en yakın boş hücreyi seç. Tüm adaylar clampPos sınırları
 * içinde (menü barı + kenar payı).
 */
function resolvePosition(
  desiredX: number,
  desiredY: number,
  type: DesktopWidgetType,
  others: Rect[],
): { x: number; y: number } {
  const size = sizeOf(type)
  const first = clampPos(desiredX, desiredY, type)
  if (!collides(first, size, others)) return first

  const { vw, vh } = viewport()
  const minX = EDGE
  const maxX = Math.max(EDGE, vw - size.w - EDGE)
  const minY = MENU_BAR_H
  const maxY = Math.max(MENU_BAR_H, vh - size.h - EDGE)
  const STEP = 16

  // (1) Aynı sütunda aşağı doğru ilk boşluk.
  for (let y = first.y; y <= maxY; y += STEP) {
    if (!collides({ x: first.x, y }, size, others)) return { x: first.x, y }
  }
  // (2) Aynı satırda sağa doğru ilk boşluk.
  for (let x = first.x; x <= maxX; x += STEP) {
    if (!collides({ x, y: first.y }, size, others)) return { x, y: first.y }
  }
  // (3) Izgara taraması — çakışmayan hücreler arasında desired'a en yakını.
  let best: { x: number; y: number } | null = null
  let bestDist = Infinity
  for (let y = minY; y <= maxY; y += STEP) {
    for (let x = minX; x <= maxX; x += STEP) {
      if (collides({ x, y }, size, others)) continue
      const dx = x - first.x
      const dy = y - first.y
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        best = { x, y }
      }
    }
  }
  return best ?? first
}

/**
 * iOS ana-ekran tarzı "yer açma" (dwell displacement) — modül-kapsamı durum.
 * Aynı anda tek sürükleme olduğundan state objesi yerine modül değişkenleri
 * yeterli (re-render tetiklemezler):
 *  - `dwellTimer`: bekleme sayacı. GERÇEK bir stillness debounce'tur — her
 *    pointermove'da sıfırlanır, dolayısıyla yalnız pointer HAREKETSİZ kalınca
 *    (kullanıcı gerçekten beklerse) dolar; "widget'a girildikten X ms sonra"
 *    değil (yavaş üzerinden geçmek yanlışlıkla kaydırmasın).
 *  - `latestDragRect`: sürüklenen kartın en güncel dikdörtgeni (timer
 *    ateşlendiğinde displacement bunu kullanır).
 *  - `dragOrigin`: drag BAŞINDAKİ tüm kartların konumları. Drop'ta layout bu
 *    snapshot'tan YENİDEN kurulur → yalnız sürüklenen kartın FİNAL konumuyla
 *    çakışanlar kaydırılı kalır, gerisi yuvasına döner (iOS deliğin kapanması).
 *    Vazgeçilen/kesilen sürükleme kalıcı iz bırakmaz.
 */
const HOVER_DWELL_MS = 340
let dwellTimer: ReturnType<typeof setTimeout> | null = null
let latestDragRect: Rect | null = null
let dragOrigin: Map<string, { x: number; y: number }> | null = null

function clearDwell() {
  if (dwellTimer) {
    clearTimeout(dwellTimer)
    dwellTimer = null
  }
  latestDragRect = null
}

function persist(slug: string | null, widgets: DesktopWidgetInstance[]) {
  if (!slug || typeof window === "undefined") return
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(widgets))
  } catch {
    /* quota vb. — sessiz */
  }
}

/** Ham diziyi geçerli widget instance'larına süz (bilinmeyen tipleri atar). */
function sanitizeWidgets(parsed: unknown): DesktopWidgetInstance[] {
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (w): w is DesktopWidgetInstance =>
      Boolean(w) &&
      typeof (w as DesktopWidgetInstance).id === "string" &&
      typeof (w as DesktopWidgetInstance).type === "string" &&
      Boolean(widgetDef((w as DesktopWidgetInstance).type)) &&
      typeof (w as DesktopWidgetInstance).x === "number" &&
      typeof (w as DesktopWidgetInstance).y === "number",
  )
}

function readStored(slug: string): DesktopWidgetInstance[] | null {
  try {
    const raw = localStorage.getItem(storageKey(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return sanitizeWidgets(parsed)
  } catch {
    return null
  }
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}

/**
 * İlk kurulum seed'i — YENİ hesap kullanıcının erişebildiği TÜM widget'larla
 * gelir (achievements + clock her zaman; mail/storage/linear yalnız o app'e
 * erişim varsa — permGate `availableAppIds` ile eşleşir). Sağ kenardan aşağı
 * doğru dizilir; taşarsa sola yeni sütuna sarar. Konumlar clampPos'ludur.
 */
function seedWidgets(availableAppIds?: string[]): DesktopWidgetInstance[] {
  try {
    if (localStorage.getItem(LEGACY_ACH_HIDDEN_KEY) === "1") {
      // Eski kullanıcı achievements'ı gizlemişti — yalnız clock seed'le.
      const { vw } = viewport()
      const c = clampPos(vw - 240, MENU_BAR_H + 16, "clock")
      return [{ id: newId(), type: "clock", x: c.x, y: c.y }]
    }
  } catch {
    /* ignore */
  }

  const gate = (id: string) => !availableAppIds || availableAppIds.includes(id)
  const types = WIDGET_REGISTRY.filter(
    (d) => !d.permGate || gate(d.permGate),
  ).map((d) => d.type)

  const { vw, vh } = viewport()
  const out: DesktopWidgetInstance[] = []
  // Sağ kenara yaslı dikey sütun; sütun dolunca sola kay.
  let colRight = vw - EDGE
  let y = MENU_BAR_H + 16
  let colW = 0
  for (const type of types) {
    const size = widgetDef(type)!.defaultSize
    if (y + size.h + EDGE > vh && out.length > 0) {
      colRight -= colW + 16
      y = MENU_BAR_H + 16
      colW = 0
    }
    // Sütun düzeni desired; halihazırda yerleşmiş kartlarla çakışırsa (dar
    // ekran, farklı boyut) collision-resolve garantiye alır.
    const pos = resolvePosition(colRight - size.w, y, type, otherRects(out))
    out.push({ id: newId(), type, x: pos.x, y: pos.y })
    y += size.h + 16
    colW = Math.max(colW, size.w)
  }
  return out
}

interface DesktopWidgetsState {
  slug: string | null
  loaded: boolean
  widgets: DesktopWidgetInstance[]
  /** Masaüstü sağ-tık "Refresh widgets" sayacı — widget'lar + achievements
   *  bunu effect dep'i olarak dinler; bump → tümü yeniden fetch eder. */
  refreshNonce: number
  /** Şirket için localStorage cache/seed'inden yükle (idempotent — aynı slug'da
   *  no-op). ANINDA gösterir (flash yok); sunucu reconcile'i `syncFromServer`.
   *  `availableAppIds` — yeni hesap seed'inde izin-farkındalıklı widget seti. */
  load: (slug: string, availableAppIds?: string[]) => void
  /**
   * Sunucu (os_preferences.widgets) ile reconcile — useOsPrefsSync mount GET'i
   * çağırır. `serverWidgets` verilmişse (boş dizi dahil AUTHORITATIVE) onu
   * uygular; `undefined` ise (sunucuda kayıt yok) yerel cache ?? seed uygulanır
   * ve `needMigrate:true` döner (çağıran sunucuya PUT eder). Loaded guard'ından
   * BAĞIMSIZ — sunucu her zaman otoriter. */
  syncFromServer: (
    slug: string,
    serverWidgets: DesktopWidgetInstance[] | undefined,
    availableAppIds?: string[],
  ) => { widgets: DesktopWidgetInstance[]; needMigrate: boolean }
  add: (type: DesktopWidgetType) => void
  remove: (id: string) => void
  move: (id: string, x: number, y: number) => void
  /** O an sürüklenen widget'ın id'si (null = sürükleme yok). Bileşenler buna
   *  abone OLMAZ — yalnız store aksiyonları get() ile okur. */
  dragId: string | null
  /** Sürükleme başladı (5px eşik aşıldı). Dwell'i temizler + origin snapshot alır. */
  beginWidgetDrag: (id: string) => void
  /** Her pointermove'da sürüklenen kartın canlı sol-üst köşesini bildirir. Dwell
   *  sayacını HER harekette sıfırlar (stillness debounce) — kart bir şeyle
   *  çakışıyorken pointer HAREKETSİZ kalırsa 340ms sonra altındaki widget'lar
   *  yana kayar; hareket sürerken ateşlemez. */
  dragWidgetTo: (id: string, x: number, y: number) => void
  /** Dwell ateşlendiğinde: `rect` ile çakışan TÜM widget'ları sırayla en yakın
   *  boş konuma kaydır (canlı önizleme — delik açılır). Sadece state, kalıcı
   *  DEĞİL; nihai layout drop'ta origin'den yeniden kurulur. */
  _displaceForDrag: (draggedId: string, rect: Rect) => void
  /** Drop: dwell'i temizle, layout'u origin snapshot'tan YENİDEN kur (yalnız
   *  final konumla çakışanlar kaydırılı kalır, gerisi yuvasına döner), persist et.
   *  Aktif drag id'si eşleşmezse (sızan/eski handler) no-op — aktif drag'e dokunmaz. */
  endWidgetDrag: (id: string, x: number, y: number) => void
  /** Sürükleme kesildi (pointercancel / unmount). Tentative displacement'ları
   *  origin'e geri al, dragId'yi sıfırla. Persist ETMEZ — iz bırakmaz. */
  cancelWidgetDrag: (id: string) => void
  setConfig: (id: string, patch: Record<string, unknown>) => void
  /** Tüm masaüstü widget verilerini yeniden çektir. */
  bumpRefresh: () => void
}

export const useDesktopWidgets = create<DesktopWidgetsState>((set, get) => ({
  slug: null,
  loaded: false,
  widgets: [],
  refreshNonce: 0,
  dragId: null,

  load: (slug, availableAppIds) => {
    if (get().slug === slug && get().loaded) return
    // Şirket/slug değişiyor — devam eden bir sürüklemenin dwell timer'ı / origin'i
    // / dragId'si YENİ şirketin widget'larına sızmasın (kesilmiş drag artığı).
    clearDwell()
    dragOrigin = null
    const stored = readStored(slug)
    const widgets = stored ?? seedWidgets(availableAppIds)
    if (!stored) persist(slug, widgets)
    // Ekran küçüldüyse / eski konumlar taşıyorsa görünür alana çek (gerçek boyut).
    const clamped = widgets.map((w) => ({ ...w, ...clampPos(w.x, w.y, w.type) }))
    set({ slug, widgets: clamped, loaded: true, dragId: null })
  },

  syncFromServer: (slug, serverWidgets, availableAppIds) => {
    // Slug değiştiyse kesilmiş drag artığını temizle (load ile aynı gerekçe).
    if (get().slug !== slug) {
      clearDwell()
      dragOrigin = null
    }
    // Sunucu dizi döndürdüyse (boş dahil) otoriter; yoksa yerel/seed → migrate.
    let base: DesktopWidgetInstance[]
    let needMigrate: boolean
    if (serverWidgets !== undefined) {
      base = sanitizeWidgets(serverWidgets)
      needMigrate = false
    } else {
      base = readStored(slug) ?? seedWidgets(availableAppIds)
      needMigrate = true
    }
    const clamped = base.map((w) => ({ ...w, ...clampPos(w.x, w.y, w.type) }))
    // Yerel cache'i sunucu gerçeğiyle hizala (offline cache tazelensin).
    persist(slug, clamped)
    set({ slug, widgets: clamped, loaded: true, dragId: null })
    return { widgets: clamped, needMigrate }
  },

  add: (type) =>
    set((s) => {
      const def = widgetDef(type)
      if (!def || !s.slug) return {}
      const { vw } = viewport()
      // Sağ-üstten başlayıp çakışmayan İLK boş konuma yerleştir (kademeli
      // offset yerine collision-aware — yeni kart mevcutların üstüne binmez).
      const pos = resolvePosition(
        vw - def.defaultSize.w - EDGE,
        MENU_BAR_H + 20,
        type,
        otherRects(s.widgets),
      )
      const widget: DesktopWidgetInstance = { id: newId(), type, x: pos.x, y: pos.y }
      const widgets = [...s.widgets, widget]
      persist(s.slug, widgets)
      queuePrefsPatch(s.slug, { widgets })
      return { widgets }
    }),

  remove: (id) =>
    set((s) => {
      const widgets = s.widgets.filter((w) => w.id !== id)
      persist(s.slug, widgets)
      if (s.slug) queuePrefsPatch(s.slug, { widgets })
      return { widgets }
    }),

  move: (id, x, y) =>
    set((s) => {
      const target = s.widgets.find((w) => w.id === id)
      if (!target) return {}
      // Drop commit'i: clampPos SONRASI diğer kartlarla çakışıyorsa en yakın
      // boş konuma it (macOS widget snap — üst üste binmez).
      const clamped = clampPos(x, y, target.type)
      const resolved = resolvePosition(
        clamped.x,
        clamped.y,
        target.type,
        otherRects(s.widgets, id),
      )
      const widgets = s.widgets.map((w) =>
        w.id === id ? { ...w, x: resolved.x, y: resolved.y } : w,
      )
      persist(s.slug, widgets)
      if (s.slug) queuePrefsPatch(s.slug, { widgets })
      return { widgets }
    }),

  beginWidgetDrag: (id) => {
    clearDwell()
    // Drag başındaki tüm konumları sakla — drop/iptal bunu referans alır.
    dragOrigin = new Map(get().widgets.map((w) => [w.id, { x: w.x, y: w.y }]))
    set({ dragId: id })
  },

  dragWidgetTo: (id, x, y) => {
    const s = get()
    if (s.dragId !== id) return
    const w = s.widgets.find((it) => it.id === id)
    if (!w) return
    const size = sizeOf(w.type)
    const rect: Rect = { x, y, w: size.w, h: size.h }
    latestDragRect = rect
    // Stillness debounce: HER harekette sayacı sıfırla. pointermove akışı
    // durunca (kullanıcı beklerse) 340ms dolar → yalnız o zaman yer açılır.
    if (dwellTimer) {
      clearTimeout(dwellTimer)
      dwellTimer = null
    }
    const overlaps = s.widgets.some(
      (o) =>
        o.id !== id &&
        rectsOverlap({ x: o.x, y: o.y, ...sizeOf(o.type) }, rect),
    )
    if (!overlaps) return // hiçbir şeyle çakışmıyor — beklemeye gerek yok
    dwellTimer = setTimeout(() => {
      dwellTimer = null
      const st = get()
      if (st.dragId !== id || !latestDragRect || !st.widgets.some((v) => v.id === id))
        return
      st._displaceForDrag(id, latestDragRect)
    }, HOVER_DWELL_MS)
  },

  _displaceForDrag: (draggedId, rect) =>
    set((s) => {
      // rect ile çakışan tüm widget'ları (sürüklenen hariç) sırayla kaydır;
      // her biri diğerlerini + sürüklenen kartı engel sayarak en yakın boşa gider.
      const overlapping = s.widgets.filter(
        (w) =>
          w.id !== draggedId &&
          rectsOverlap({ x: w.x, y: w.y, ...sizeOf(w.type) }, rect),
      )
      if (overlapping.length === 0) return {}
      let next = s.widgets
      for (const o of overlapping) {
        const obstacles: Rect[] = next
          .filter((w) => w.id !== o.id && w.id !== draggedId)
          .map((w) => ({ x: w.x, y: w.y, ...sizeOf(w.type) }))
        obstacles.push(rect)
        const pos = resolvePosition(o.x, o.y, o.type, obstacles)
        if (pos.x === o.x && pos.y === o.y) continue
        next = next.map((w) => (w.id === o.id ? { ...w, x: pos.x, y: pos.y } : w))
      }
      if (next === s.widgets) return {}
      return { widgets: next }
    }),

  endWidgetDrag: (id, x, y) => {
    // Sızan/eski bir handler (başka pointer) ise aktif drag'e DOKUNMA — no-op.
    if (get().dragId !== id) return
    clearDwell()
    set((s) => {
      const target = s.widgets.find((w) => w.id === id)
      if (!target) {
        dragOrigin = null
        return { dragId: null }
      }
      const size = sizeOf(target.type)
      // Referans = drag BAŞINDAKİ konumlar (mid-drag tentative değil). Böylece
      // yalnız gerçekten gereken kartlar yer değiştirir, gerisi yuvasına döner.
      const origin = dragOrigin
      const originPos = (w: DesktopWidgetInstance) =>
        origin?.get(w.id) ?? { x: w.x, y: w.y }
      // Sürüklenen kart TAM bırakıldığı yere oturur (iOS: nereye bırakırsan oraya;
      // çakışan komşular etrafında akar). Yalnız görünür alana kırpılır.
      const finalPos = clampPos(x, y, target.type)
      const finalRect: Rect = { x: finalPos.x, y: finalPos.y, w: size.w, h: size.h }

      // Herkesi origin'e sıfırla; sürüklenen = finalPos.
      let rebuilt = s.widgets.map((w) =>
        w.id === id
          ? { ...w, x: finalPos.x, y: finalPos.y }
          : { ...w, ...originPos(w) },
      )
      // Origin'i finalRect ile çakışan diğerlerini sırayla kaydır (delik aç).
      // Not: for-of ORİJİNAL diziyi gezer (origin konumları); obstacles her
      // adımda güncel `rebuilt`ten okunur → kaydırılanlar birbirine binmez.
      for (const w of rebuilt) {
        if (w.id === id) continue
        if (!rectsOverlap({ x: w.x, y: w.y, ...sizeOf(w.type) }, finalRect)) continue
        const obstacles: Rect[] = rebuilt
          .filter((other) => other.id !== w.id && other.id !== id)
          .map((other) => ({ x: other.x, y: other.y, ...sizeOf(other.type) }))
        obstacles.push(finalRect)
        const pos = resolvePosition(w.x, w.y, w.type, obstacles)
        if (pos.x === w.x && pos.y === w.y) continue
        rebuilt = rebuilt.map((r) => (r.id === w.id ? { ...r, x: pos.x, y: pos.y } : r))
      }

      dragOrigin = null
      persist(s.slug, rebuilt)
      if (s.slug) queuePrefsPatch(s.slug, { widgets: rebuilt })
      return { widgets: rebuilt, dragId: null }
    })
  },

  cancelWidgetDrag: (id) => {
    clearDwell()
    const origin = dragOrigin
    dragOrigin = null
    set((s) => {
      if (s.dragId !== id) return {} // aktif drag değil — dokunma
      if (!origin) return { dragId: null }
      // Tentative displacement'ları geri al — iptal iz bırakmaz, persist YOK.
      const widgets = s.widgets.map((w) => {
        const o = origin.get(w.id)
        return o ? { ...w, x: o.x, y: o.y } : w
      })
      return { widgets, dragId: null }
    })
  },

  setConfig: (id, patch) =>
    set((s) => {
      const widgets = s.widgets.map((w) =>
        w.id === id ? { ...w, config: { ...w.config, ...patch } } : w,
      )
      persist(s.slug, widgets)
      if (s.slug) queuePrefsPatch(s.slug, { widgets })
      return { widgets }
    }),

  bumpRefresh: () => set((s) => ({ refreshNonce: s.refreshNonce + 1 })),
}))
