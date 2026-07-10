import { create } from "zustand"

/** Üçüncü buton için ortak ayrımcı — `confirm()` promise'i `"tertiary"`
 *  değeriyle çözülür ve caller branch'leyebilir. Mevcut binary kullanım
 *  (`if (!ok) return`) etkilenmez: `"tertiary"` truthy. */
export type ConfirmResult = boolean | "tertiary"

export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** Destructive action — kırmızı "danger" stilinde onay butonu. */
  destructive?: boolean
  /** Verilirse 3. buton render olur — dialog'da cancel + tertiary +
   *  confirm sıralı. Kullanıcı tıklarsa promise `"tertiary"` ile çözülür.
   *  Use case: "save / discard / keep editing" tarzı 3-yollu dialog. */
  tertiaryText?: string
  /** Tertiary butonun stili destructive olsun mu (örn. "Discard changes"). */
  tertiaryDestructive?: boolean
}

interface ConfirmState {
  isOpen: boolean
  options: ConfirmOptions | null
  /** Internal — pending promise'i çözen fonksiyon. */
  resolver: ((value: ConfirmResult) => void) | null

  /**
   * Onay iste. Kullanıcı onay verirse `true`, iptal ederse `false`,
   * tertiary butonuna basarsa `"tertiary"` döner.
   *
   * @example
   * const choice = await useConfirmStore.getState().confirm({
   *   title: "Bu listeyi silmek istiyor musun?",
   *   description: "Bu işlem geri alınamaz.",
   *   destructive: true,
   * })
   * if (!choice) return
   */
  confirm: (options: ConfirmOptions) => Promise<ConfirmResult>

  /** Dialog "confirm" butonuna basılınca çağrılır. */
  handleConfirm: () => void

  /** Dialog kapatıldığında (cancel / ESC / backdrop) çağrılır. */
  handleCancel: () => void

  /** Dialog "tertiary" butonuna basılınca çağrılır. */
  handleTertiary: () => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  isOpen: false,
  options: null,
  resolver: null,

  confirm: (options) => {
    // Önceki bekleyen promise varsa false ile çöz
    const prev = get().resolver
    if (prev) prev(false)

    return new Promise<ConfirmResult>((resolve) => {
      set({
        isOpen: true,
        options,
        resolver: resolve,
      })
    })
  },

  handleConfirm: () => {
    const { resolver } = get()
    resolver?.(true)
    set({ isOpen: false, resolver: null })
  },

  handleCancel: () => {
    const { resolver } = get()
    resolver?.(false)
    set({ isOpen: false, resolver: null })
  },

  handleTertiary: () => {
    const { resolver } = get()
    resolver?.("tertiary")
    set({ isOpen: false, resolver: null })
  },
}))

/** Component dışından doğrudan çağırmak için kolaylık sağlayan helper. */
export const confirm = (options: ConfirmOptions): Promise<ConfirmResult> =>
  useConfirmStore.getState().confirm(options)
