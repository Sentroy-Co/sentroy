"use client"

import { useEffect, useRef, type ReactNode } from "react"

/**
 * Sosyal feed içindeki dahili profil/post linklerini Sentroy OS pencerelerine
 * yönlendiren köprü. İki bağlam:
 *
 *  - **Embed iframe** (OS'ta açılan şirket profili / post-detay / kullanıcı
 *    profili sayfası): link tıklaması `<a>` navigasyonunu iptal eder ve OS
 *    parent'ına `postMessage({type:"sentroy-os:open"})` atar → OS yeni iframe
 *    penceresi açar. Böylece avatar/post tıklaması OS DIŞINA atmaz.
 *  - **Native OS doc** (Activity widget'ı doğrudan OS dökümanında): `onOpen`
 *    verilir → doğrudan çağrılır (OS store `openApp`). postMessage gerekmez.
 *  - **Doğrudan tarayıcı ziyareti** (embed değil, onOpen yok): hiçbir şey yapmaz,
 *    linkler normal gezinir.
 *
 * Delegated capture listener yalnız bu bileşenin alt-ağacındaki linklere
 * uygulanır (`display:contents` wrapper → layout'u bozmaz, event'ler geçer).
 * Yalnız `/[lang]/profile/u/...` ve `/[lang]/d/<slug>/posts/...` dahili
 * pattern'leri yakalanır; `target=_blank` (ekler) ve dış linkler dokunulmaz.
 */
const INTERNAL_RE = /^\/[a-z]{2}\/(profile\/u\/|d\/[^/]+\/posts\/)/

export function OsLinkBridge({
  children,
  onOpen,
}: {
  children: ReactNode
  onOpen?: (href: string, title: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const embedded = window.self !== window.top
    // Ne native (onOpen) ne embed → linkleri olduğu gibi bırak.
    if (!onOpen && !embedded) return

    function handler(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return
      const target = e.target as HTMLElement | null
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.target === "_blank") return
      const href = a.getAttribute("href") || ""
      if (!INTERNAL_RE.test(href)) return
      e.preventDefault()
      const title =
        (a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48) || "Sentroy"
      if (onOpen) onOpen(href, title)
      else window.parent.postMessage({ type: "sentroy-os:open", url: href, title }, "*")
    }

    el.addEventListener("click", handler)
    return () => el.removeEventListener("click", handler)
  }, [onOpen])

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  )
}
