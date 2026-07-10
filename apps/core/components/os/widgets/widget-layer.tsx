"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Settings01Icon } from "@hugeicons/core-free-icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { useOsStore } from "../os-store"
import { AchievementsWidgetContent } from "../achievements/achievements-widget"
import { widgetDef, type DesktopWidgetInstance } from "./registry"
import { useDesktopWidgets } from "./widget-store"
import { ClockWidgetContent, ClockConfig } from "./clock-widget"
import { MailInboxWidgetContent, MailInboxConfig } from "./mail-inbox-widget"
import { StorageWidgetContent, StorageConfig } from "./storage-widget"
import { LinearWidgetContent } from "./linear-widget"
import { CryptoSingleWidgetContent, CryptoSingleConfig } from "./crypto-widget-single"
import { CryptoTableWidgetContent, CryptoTableConfig } from "./crypto-widget-table"

const MENU_BAR_H = 44

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

/**
 * Masaüstü widget katmanı — note-widget-layer deseni: z-[5] (pencerelerin
 * ALTINDA, WindowManager z-10), katman `pointer-events-none`, yalnız kartlar
 * etkileşimli (boş alan masaüstü show-desktop tıklamasını engellemez).
 *
 * Her kart WidgetShell: cam reçetesi (upgrade-card dili), HER YERİNDEN
 * sürüklenebilir (buton/link/config alanları hariç; 5px eşik — tıklamalar
 * içeriğe normal geçer), hover'da sağ-üst köşede ✕ (kaldır) + config'li
 * tiplerde ⚙ (ayar popover'ı). Kalıcılık widget-store (localStorage, şirket
 * başına). Şirket değişince kartlar remount → veriler tazelenir.
 */
export function DesktopWidgetLayer({
  slug,
  lang,
  apps,
  onOpenAchievements,
  onOpenStoragePath,
}: {
  slug: string
  lang: string
  /** Stage app'leri — permGate'li widget'lar app yoksa render edilmez. */
  apps: AppDescriptor[]
  /** Achievements penceresi (dynamicApps descriptor'ıyla) aç. */
  onOpenAchievements: () => void
  /** Storage'ı belirli bir bucket/klasör (+opsiyonel dosya) yolunda,
   *  plain-iframe pencere olarak aç (storage widget deep-link'i). */
  onOpenStoragePath: (bucket: string, folder: string, fileId?: string) => void
}) {
  const widgets = useDesktopWidgets((s) => s.widgets)
  const storeSlug = useDesktopWidgets((s) => s.slug)
  const load = useDesktopWidgets((s) => s.load)
  const remove = useDesktopWidgets((s) => s.remove)
  const beginDrag = useDesktopWidgets((s) => s.beginWidgetDrag)
  const dragTo = useDesktopWidgets((s) => s.dragWidgetTo)
  const endDrag = useDesktopWidgets((s) => s.endWidgetDrag)
  const cancelDrag = useDesktopWidgets((s) => s.cancelWidgetDrag)
  const setConfig = useDesktopWidgets((s) => s.setConfig)
  const refreshNonce = useDesktopWidgets((s) => s.refreshNonce)
  const openApp = useOsStore((s) => s.openApp)

  useEffect(() => {
    // availableAppIds → yeni hesap seed'i izin-farkındalıklı (mail/storage/linear
    // widget'ları yalnız o app'e erişim varsa gelir).
    if (slug) load(slug, apps.map((a) => a.id))
  }, [slug, load, apps])

  if (!slug || storeSlug !== slug) return null

  const appIds = new Set(apps.map((a) => a.id))

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {widgets.map((w) => {
        const def = widgetDef(w.type)
        if (!def) return null
        // Kullanıcının erişemediği app'in widget'ı sessizce render edilmez
        // (instance korunur — erişim geri gelirse görünür).
        if (def.permGate && !appIds.has(def.permGate)) return null
        return (
          <WidgetShell
            key={`${slug}:${w.id}`}
            widget={w}
            width={def.defaultSize.w}
            hasConfig={Boolean(def.configSchema)}
            dataTour={w.type === "achievements" ? "achievements" : undefined}
            onRemove={() => remove(w.id)}
            onDragBegin={() => beginDrag(w.id)}
            onDragMove={(x, y) => dragTo(w.id, x, y)}
            onDragEnd={(x, y) => endDrag(w.id, x, y)}
            onDragCancel={() => cancelDrag(w.id)}
            renderConfig={(close) => (
              <WidgetConfigForm
                widget={w}
                slug={slug}
                onChange={(patch) => {
                  setConfig(w.id, patch)
                  // Tek-adım seçim (mailbox/crypto-single) → seçince kapat.
                  // Çok-adım formlar (clock-format toggle, crypto-table chip'ler,
                  // storage bucket+folder) açık kalır — kullanıcı klasörü de seçebilsin.
                  const multiStep =
                    def.configSchema === "clock-format" ||
                    def.configSchema === "crypto-table" ||
                    def.configSchema === "bucket"
                  if (!multiStep) close()
                }}
              />
            )}
          >
            {({ openConfig }) => (
              <WidgetBody
                widget={w}
                slug={slug}
                lang={lang}
                refreshKey={refreshNonce}
                onOpenApp={openApp}
                onOpenAchievements={onOpenAchievements}
                onOpenStoragePath={onOpenStoragePath}
                onConfigure={openConfig}
              />
            )}
          </WidgetShell>
        )
      })}
    </div>
  )
}

/** Tip → içerik eşlemesi (registry veri-only kalsın diye burada). `refreshKey`
 *  değişince veri widget'ları yeniden fetch eder (sağ-tık "Refresh widgets"). */
function WidgetBody({
  widget,
  slug,
  lang,
  refreshKey,
  onOpenApp,
  onOpenAchievements,
  onOpenStoragePath,
  onConfigure,
}: {
  widget: DesktopWidgetInstance
  slug: string
  lang: string
  refreshKey: number
  onOpenApp: (appId: string) => void
  onOpenAchievements: () => void
  onOpenStoragePath: (bucket: string, folder: string, fileId?: string) => void
  onConfigure: () => void
}) {
  switch (widget.type) {
    case "achievements":
      // useAchievements refreshNonce'i kendi içinde dinler.
      return <AchievementsWidgetContent slug={slug} onOpen={onOpenAchievements} />
    case "clock":
      return <ClockWidgetContent lang={lang} config={widget.config} />
    case "mail-inbox":
      return (
        <MailInboxWidgetContent
          slug={slug}
          config={widget.config}
          refreshKey={refreshKey}
          onOpenApp={onOpenApp}
          onConfigure={onConfigure}
        />
      )
    case "storage-quick":
      return (
        <StorageWidgetContent
          slug={slug}
          config={widget.config}
          refreshKey={refreshKey}
          onOpenStoragePath={onOpenStoragePath}
          onConfigure={onConfigure}
        />
      )
    case "linear-requests":
      return <LinearWidgetContent slug={slug} refreshKey={refreshKey} onOpenApp={onOpenApp} />
    case "crypto-single":
      return <CryptoSingleWidgetContent config={widget.config} refreshKey={refreshKey} />
    case "crypto-table":
      return <CryptoTableWidgetContent config={widget.config} refreshKey={refreshKey} />
    default:
      return null
  }
}

/** Tip → config formu (⚙ popover içeriği). */
function WidgetConfigForm({
  widget,
  slug,
  onChange,
}: {
  widget: DesktopWidgetInstance
  slug: string
  onChange: (patch: Record<string, unknown>) => void
}) {
  switch (widget.type) {
    case "clock":
      return <ClockConfig config={widget.config} onChange={onChange} />
    case "mail-inbox":
      return <MailInboxConfig slug={slug} config={widget.config} onChange={onChange} />
    case "storage-quick":
      return <StorageConfig slug={slug} config={widget.config} onChange={onChange} />
    case "crypto-single":
      return <CryptoSingleConfig config={widget.config} onChange={onChange} />
    case "crypto-table":
      return <CryptoTableConfig config={widget.config} onChange={onChange} />
    default:
      return null
  }
}

/**
 * Tek widget kabuğu — cam kart + sürükleme + hover chrome (✕/⚙ rozetleri
 * kartın DIŞ köşesinde, macOS widget düzenleme dili). Sürükleme kartın her
 * yerinden: pointerdown sonrası 5px eşik aşılırsa drag başlar (pointer
 * capture); eşik aşılmazsa native click içeriğe normal işler. Drag bitince
 * click bir kez bastırılır (onClickCapture).
 */
function WidgetShell({
  widget,
  width,
  hasConfig,
  dataTour,
  onRemove,
  onDragBegin,
  onDragMove,
  onDragEnd,
  onDragCancel,
  renderConfig,
  children,
}: {
  widget: DesktopWidgetInstance
  width: number
  hasConfig: boolean
  /** Tur spotlight hedefi (achievements widget'ı için "achievements"). */
  dataTour?: string
  onRemove: () => void
  /** Sürükleme başladı (5px eşik aşıldı) — store dwell durumunu sıfırlar. */
  onDragBegin: () => void
  /** Sürükleme sırasında canlı sol-üst köşe — store dwell/yer-açma hesaplar. */
  onDragMove: (x: number, y: number) => void
  /** Drop — store layout'u origin'den kurup persist eder. */
  onDragEnd: (x: number, y: number) => void
  /** Sürükleme kesildi (pointercancel/unmount) — store origin'e geri alır. */
  onDragCancel: () => void
  renderConfig: (close: () => void) => React.ReactNode
  children: (helpers: { openConfig: () => void }) => React.ReactNode
}) {
  const t = useTranslations("os")
  const [pos, setPos] = useState({ x: widget.x, y: widget.y })
  const [dragSelf, setDragSelf] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const dragging = useRef(false)
  const suppressClick = useRef(false)
  /** Aktif sürüklemenin window listener'larını sökme fonksiyonu — unmount'ta
   *  çağrılır (kesilmiş drag'in listener'ları sızmasın). */
  const teardownRef = useRef<(() => void) | null>(null)

  // Store'dan konum değişirse senkronla — DRAG SIRASINDA DEĞİL. Bu, iOS tarzı
  // "yer açma"nın çalıştığı yer: başka bir kart sürüklenirken bu kart store'da
  // kaydırılırsa (dwell displacement) burası tetiklenir ve spring ile süzülür.
  useEffect(() => {
    if (!dragging.current) setPos({ x: widget.x, y: widget.y })
  }, [widget.x, widget.y])

  // Unmount'ta (şirket değişimi, widget kaldırma) devam eden sürüklemenin
  // window listener'larını sök — aksi halde sızıp hayalet drag yaratır.
  useEffect(() => () => teardownRef.current?.(), [])

  function startDrag(e: React.PointerEvent) {
    if (e.button !== 0) return
    const target = e.target as Element
    // Etkileşimli elemanlardan sürükleme başlatma — tıklama onlara kalsın.
    if (target.closest("button, a, input, textarea, select, [role='option'], [data-no-drag]")) return
    const el = e.currentTarget as HTMLElement
    const start = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y }
    const pointerId = e.pointerId
    // Kartın TAM boyutuyla kırp — sağ/alt kenardan taşmayı önler (eski sabit
    // `-96`/`-72` kart genişliğini saymadığından sağ tarafta taşıyordu).
    const size = widgetDef(widget.type)?.defaultSize ?? { w: width, h: 180 }
    const EDGE = 12
    const compute = (ev: PointerEvent) => ({
      x: clamp(start.x + ev.clientX - start.px, EDGE, Math.max(EDGE, window.innerWidth - size.w - EDGE)),
      y: clamp(start.y + ev.clientY - start.py, MENU_BAR_H, Math.max(MENU_BAR_H, window.innerHeight - size.h - EDGE)),
    })
    // Ortak sökme — pointerup/pointercancel/unmount hepsi bunu çağırır.
    const teardown = () => {
      window.removeEventListener("pointermove", moveHandler)
      window.removeEventListener("pointerup", upHandler)
      window.removeEventListener("pointercancel", cancelHandler)
      teardownRef.current = null
    }
    const releaseCapture = () => {
      try {
        el.releasePointerCapture?.(pointerId)
      } catch {
        /* pointer zaten serbest (NotFoundError) — yoksay */
      }
    }
    const moveHandler = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return // başka pointer — bu drag'i sürüklemesin
      const p = compute(ev)
      if (!dragging.current) {
        if (Math.hypot(ev.clientX - start.px, ev.clientY - start.py) < 5) return
        dragging.current = true
        suppressClick.current = true
        setDragSelf(true)
        el.setPointerCapture?.(pointerId)
        onDragBegin()
      }
      setPos(p)
      onDragMove(p.x, p.y)
    }
    const upHandler = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      teardown()
      if (!dragging.current) return
      releaseCapture()
      dragging.current = false
      const p = compute(ev)
      setPos(p)
      setDragSelf(false)
      // Store drop'u origin'den kurup yerleştirir. Değişirse widget.x/y
      // güncellenir → yukarıdaki effect setPos ile spring'ler.
      onDragEnd(p.x, p.y)
      // Drag'i takip eden click'i bastır; sonraki tıklamalar normal.
      setTimeout(() => {
        suppressClick.current = false
      }, 0)
    }
    // pointercancel: sistem jesti / çoklu dokunuş / DOM detach ile sürükleme
    // kesilir; pointerup GELMEZ. Origin'e geri al, konum COMMIT ETME.
    const cancelHandler = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      teardown()
      if (!dragging.current) return
      releaseCapture()
      dragging.current = false
      setDragSelf(false)
      onDragCancel()
      setTimeout(() => {
        suppressClick.current = false
      }, 0)
    }
    teardownRef.current = teardown
    window.addEventListener("pointermove", moveHandler)
    window.addEventListener("pointerup", upHandler)
    window.addEventListener("pointercancel", cancelHandler)
  }

  const posTransition = dragSelf
    ? { duration: 0 } // sürüklenen kart: parmağa anında yapışsın
    : { type: "spring" as const, stiffness: 420, damping: 34 } // yana kayanlar süzülsün

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, left: widget.x, top: widget.y }}
      animate={{ opacity: 1, scale: dragSelf ? 1.04 : 1, left: pos.x, top: pos.y }}
      transition={{
        opacity: { type: "spring", stiffness: 320, damping: 26 },
        scale: { type: "spring", stiffness: 320, damping: 26 },
        left: posTransition,
        top: posTransition,
      }}
      className="group pointer-events-auto absolute select-none"
      data-tour={dataTour}
      style={{ width, zIndex: dragSelf ? 30 : undefined }}
      onPointerDown={startDrag}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      {/* Cam kart — upgrade-card reçetesi */}
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-background/80 shadow-[0_16px_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/20" />
        {children({ openConfig: () => setConfigOpen(true) })}
      </div>

      {/* Hover chrome — dış köşe rozetleri (macOS widget düzenleme dili) */}
      <div className="absolute -right-2 -top-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
        {hasConfig ? (
          <Popover open={configOpen} onOpenChange={setConfigOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={t("widgetsHub.configure")}
                  className="flex size-6 items-center justify-center rounded-full border border-border/60 bg-background/95 text-muted-foreground shadow-md hover:text-foreground"
                >
                  <HugeiconsIcon icon={Settings01Icon} className="size-3" strokeWidth={2} />
                </button>
              }
            />
            <PopoverContent align="end" side="bottom" className="w-64 gap-2 rounded-2xl p-3">
              {renderConfig(() => setConfigOpen(false))}
            </PopoverContent>
          </Popover>
        ) : null}
        <button
          type="button"
          aria-label={t("widgetsHub.remove")}
          onClick={onRemove}
          className="flex size-6 items-center justify-center rounded-full border border-border/60 bg-background/95 text-muted-foreground shadow-md hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3" strokeWidth={2.5} />
        </button>
      </div>
    </motion.div>
  )
}
