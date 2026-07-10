import {
  Clock01Icon,
  ChampionIcon,
  Mail01Icon,
  FolderLibraryIcon,
  KanbanIcon,
  BitcoinIcon,
  ChartLineData01Icon,
} from "@hugeicons/core-free-icons"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"

/**
 * Sentroy OS — masaüstü widget platformu kayıt defteri (Apple widget galerisi
 * referansı). Veri-only: bileşen eşlemesi widget-layer'da (döngüsel import
 * olmasın). Yeni widget eklemek = buraya def + widget-layer'a content (+
 * varsa config) bileşeni + os.json'a `widgetsHub.types.<type>` çevirileri.
 *
 * Kalıcılık: masaüstü instance'ları localStorage `os-desktop-widgets:<slug>`
 * (şirket başına) — bkz. widget-store. Cross-device sync v2 notu: instance
 * listesi note-placement benzeri server koleksiyonuna taşınabilir.
 */

type IconRef = AppDescriptor["icon"]

export type DesktopWidgetType =
  | "clock"
  | "achievements"
  | "mail-inbox"
  | "storage-quick"
  | "linear-requests"
  | "crypto-single"
  | "crypto-table"

export interface DesktopWidgetDef {
  type: DesktopWidgetType
  icon: IconRef
  /** Marka/tema rengi — galeri önizlemesi + kart aksanı. */
  color: string
  /** os.<titleKey> */
  titleKey: string
  /** os.<descriptionKey> */
  descriptionKey: string
  /** Kart genişliği sabit (w); h galeri önizleme oranı için yaklaşık. */
  defaultSize: { w: number; h: number }
  /** Config popover kimliği — widget-layer bu id'ye göre form render eder. */
  configSchema?: "clock-format" | "mailbox" | "bucket" | "crypto-single" | "crypto-table"
  /** Bu app id'si kullanıcının stage app'lerinde yoksa galeri + katmanda gizlenir. */
  permGate?: string
}

/** Masaüstündeki tek widget örneği (localStorage'da saklanan shape). */
export interface DesktopWidgetInstance {
  id: string
  type: DesktopWidgetType
  x: number
  y: number
  config?: Record<string, unknown>
}

export const WIDGET_REGISTRY: DesktopWidgetDef[] = [
  {
    type: "achievements",
    icon: ChampionIcon,
    color: "#f59e0b",
    titleKey: "widgetsHub.types.achievements.title",
    descriptionKey: "widgetsHub.types.achievements.description",
    defaultSize: { w: 300, h: 190 },
  },
  {
    type: "clock",
    icon: Clock01Icon,
    color: "#0a84ff",
    titleKey: "widgetsHub.types.clock.title",
    descriptionKey: "widgetsHub.types.clock.description",
    defaultSize: { w: 220, h: 120 },
    configSchema: "clock-format",
  },
  {
    type: "mail-inbox",
    icon: Mail01Icon,
    color: "#3b82f6",
    titleKey: "widgetsHub.types.mail-inbox.title",
    descriptionKey: "widgetsHub.types.mail-inbox.description",
    defaultSize: { w: 320, h: 240 },
    configSchema: "mailbox",
    permGate: "mail",
  },
  {
    type: "storage-quick",
    icon: FolderLibraryIcon,
    color: "#a855f7",
    titleKey: "widgetsHub.types.storage-quick.title",
    descriptionKey: "widgetsHub.types.storage-quick.description",
    defaultSize: { w: 300, h: 190 },
    configSchema: "bucket",
    permGate: "storage",
  },
  {
    type: "linear-requests",
    icon: KanbanIcon,
    color: "#5E6AD2",
    titleKey: "widgetsHub.types.linear-requests.title",
    descriptionKey: "widgetsHub.types.linear-requests.description",
    defaultSize: { w: 260, h: 130 },
    permGate: "linear",
  },
  {
    // Kripto — herkese açık (permGate yok); veri Bitget spot ticker.
    type: "crypto-single",
    icon: BitcoinIcon,
    color: "#f59e0b",
    titleKey: "widgetsHub.types.crypto-single.title",
    descriptionKey: "widgetsHub.types.crypto-single.description",
    defaultSize: { w: 220, h: 150 },
    configSchema: "crypto-single",
  },
  {
    type: "crypto-table",
    icon: ChartLineData01Icon,
    color: "#f59e0b",
    titleKey: "widgetsHub.types.crypto-table.title",
    descriptionKey: "widgetsHub.types.crypto-table.description",
    defaultSize: { w: 300, h: 220 },
    configSchema: "crypto-table",
  },
]

export function widgetDef(type: DesktopWidgetType): DesktopWidgetDef | undefined {
  return WIDGET_REGISTRY.find((d) => d.type === type)
}
