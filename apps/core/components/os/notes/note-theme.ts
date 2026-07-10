import type { NoteColor, NoteVisibility } from "@workspace/db/types"

/**
 * Not renk paleti — statik Tailwind sınıfları (dinamik kurulmaz ki purge
 * etmesin). Liste/editör noktası (`DOT`), swatch seçici ve widget kart tonu
 * (`TINT`/`BORDER`) burada tek yerde.
 */

export const NOTE_COLOR_DOT: Record<NoteColor, string> = {
  default: "bg-neutral-400",
  yellow: "bg-yellow-400",
  blue: "bg-blue-400",
  green: "bg-green-400",
  pink: "bg-pink-400",
  purple: "bg-purple-400",
}

export const NOTE_COLOR_TINT: Record<NoteColor, string> = {
  default: "bg-card",
  yellow: "bg-yellow-50 dark:bg-yellow-950/40",
  blue: "bg-blue-50 dark:bg-blue-950/40",
  green: "bg-green-50 dark:bg-green-950/40",
  pink: "bg-pink-50 dark:bg-pink-950/40",
  purple: "bg-purple-50 dark:bg-purple-950/40",
}

/** Widget cam (glass) tonu — translucent renk washu; backdrop-blur ile birlikte. */
export const NOTE_COLOR_GLASS: Record<NoteColor, string> = {
  default: "bg-card/55",
  yellow: "bg-yellow-300/20 dark:bg-yellow-500/15",
  blue: "bg-blue-300/20 dark:bg-blue-500/15",
  green: "bg-green-300/20 dark:bg-green-500/15",
  pink: "bg-pink-300/20 dark:bg-pink-500/15",
  purple: "bg-purple-300/20 dark:bg-purple-500/15",
}

export const NOTE_COLOR_BORDER: Record<NoteColor, string> = {
  default: "border-border",
  yellow: "border-yellow-300/60 dark:border-yellow-500/30",
  blue: "border-blue-300/60 dark:border-blue-500/30",
  green: "border-green-300/60 dark:border-green-500/30",
  pink: "border-pink-300/60 dark:border-pink-500/30",
  purple: "border-purple-300/60 dark:border-purple-500/30",
}

export const NOTE_COLOR_SWATCHES: { key: NoteColor; dot: string }[] = (
  ["default", "yellow", "blue", "green", "pink", "purple"] as NoteColor[]
).map((key) => ({ key, dot: NOTE_COLOR_DOT[key] }))

/** Editör gizlilik seçici sırası (özel önce — not varsayılanı). */
export const NOTE_VISIBILITY_ORDER: NoteVisibility[] = [
  "author",
  "members",
  "admins",
  "public",
]
