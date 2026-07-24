"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Store01Icon, GridViewIcon, StickyNote01Icon, ChampionIcon } from "@hugeicons/core-free-icons"
import { useCompanyStore } from "@workspace/console/stores/company"
import { useNotificationsStore } from "@workspace/console/stores/notifications"
import { NotificationsProvider } from "@workspace/console/components/layout/notifications-provider"
import { useSentroyApps, type AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { useOsStore } from "./os-store"
import { MenuBar, type OsCompany, type OsUser } from "./menu-bar"
import { GetAppPopup } from "@/components/download/get-app-popup"
import { useMailDesktopNotify } from "./use-mail-desktop-notify"
import { Dock } from "./dock"
import { WindowManager } from "./window-manager"
import { WallpaperLayer } from "./wallpaper"
import { SettingsWindow } from "./settings-window"
import { CreateCompanyDialog } from "./create-company-dialog"
import { Spotlight } from "./spotlight"
import { LaunchpadOverlay } from "./launchpad-overlay"
import { WidgetPanel, type WidgetView } from "./widget-panel"
import { DesktopUpgradeCard } from "./desktop-upgrade-card"
import { NoteWidgetLayer } from "./notes/note-widget-layer"
import { DesktopWidgetLayer } from "./widgets/widget-layer"
import { DesktopContextMenu } from "./widgets/desktop-context-menu"
import { WIDGET_VIEW_EVENT } from "./widgets/widget-events"
import { TourOverlay } from "@workspace/console/components/tour"
import { useOsTour, OS_TOUR_DONE_KEY } from "./tour/os-tour"
import { EXPLORED_TOOLS_EVENT, EXPLORED_TOOLS_LS_KEY } from "./achievements/catalog"
import { FirstRun } from "./first-run"
import { useDockPinStore } from "./dock-pin-store"
import { useOsPrefsSync } from "./use-os-prefs-sync"
import { flushAllPrefs } from "./os-prefs-sync"
import { resolveDockId } from "./tools/open-tool"
import { isTrustedOsOrigin, osOpenDescriptor } from "./os-open"

const LS_KEY = "sentroy-os-active-company"

/**
 * Sentroy OS — macOS tarzı masaüstü kabuğu. Üstte menü bar, ortada kayan +
 * resize edilebilir uygulama pencereleri (WindowManager), altta
 * magnification'lı Dock. Apps lazy yüklenir, idle pencereler suspend olur
 * (bkz. os-store).
 */
export function SentroyOS({
  lang,
  user,
  isAdmin,
  initialCompanySlug,
  initialSettingsCategory,
}: {
  lang: string
  user: OsUser
  isAdmin: boolean
  /** Şirket URL'inden (/d/[slug]) gelindiyse aktif şirket bu olur. */
  initialCompanySlug?: string
  /** /d/[slug]/billing gibi bir alt-route'tan gelindiyse System Settings
   *  penceresini bu sekmede aç (aktif şirket çözülünce bir kez). */
  initialSettingsCategory?: string
}) {
  const t = useTranslations("os")
  const companies = useCompanyStore((s) => s.companies)
  const loaded = useCompanyStore((s) => s.companiesLoaded)
  const fetchCompanies = useCompanyStore((s) => s.fetchCompanies)
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  // Aktif şirkette kullanıcının kurduğu first-party app'ler (status/whatsapp/
  // studio/opencut) — App Store gating. Kurulu değilse dock/launchpad/spotlight/
  // stage'de GÖRÜNMEZ. installed route'tan beslenir; apps-changed'de tazelenir.
  const [firstPartyInstalled, setFirstPartyInstalled] = useState<string[]>([])

  useEffect(() => {
    void fetchCompanies()
  }, [fetchCompanies])

  // Aktif şirketi çöz (URL > localStorage > ilk şirket).
  useEffect(() => {
    if (!loaded || companies.length === 0) return
    setActiveSlug((prev) => {
      if (prev && companies.some((c) => c.slug === prev)) return prev
      if (initialCompanySlug && companies.some((c) => c.slug === initialCompanySlug)) return initialCompanySlug
      const stored = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null
      return stored && companies.some((c) => c.slug === stored) ? stored : companies[0]!.slug
    })
  }, [loaded, companies, initialCompanySlug])

  const active = useMemo<OsCompany | null>(
    () => companies.find((c) => c.slug === activeSlug) ?? null,
    [companies, activeSlug],
  )

  // Tarayıcı sekmesi başlığı = aktif şirket adı (server slug'ı bilmediğinden
  // /d'de client-set; şirket değişince güncellenir).
  useEffect(() => {
    if (active) document.title = active.name
  }, [active])
  // status/whatsapp/studio/opencut artık opt-in (App Store'dan kurulur) — gating
  // "kullanıcı bu şirkette kurdu mu?" ile beslenir. mail/storage/vault/auth/
  // linear/meet/tools/core DOKUNULMAZ (varsayılan görünür kalır).
  const apps = useSentroyApps({
    lang,
    companySlug: activeSlug ?? "",
    permissions: {
      isAdmin,
      canStatus: firstPartyInstalled.includes("status"),
      canWhatsapp: firstPartyInstalled.includes("whatsapp"),
      canStudio: firstPartyInstalled.includes("studio"),
      canOpencut: firstPartyInstalled.includes("opencut"),
      canBackup: firstPartyInstalled.includes("backup"),
    },
  })

  // "Sentroy" (core) bir dock app'i değil. Overview bir OS tab'ı olarak (logo
  // sistem menüsü); Profile/Settings/Billing ise macOS System Settings tarzı
  // pencerede yönetilir. Dock yalnız ürün app'lerini gösterir.
  const productApps = useMemo(() => apps.filter((a) => a.id !== "core"), [apps])
  const coreApp = useMemo(() => apps.find((a) => a.id === "core"), [apps])
  const systemScreens = useMemo<AppDescriptor[]>(() => {
    if (!coreApp) return []
    // Overview kaldırıldı — şirket profiline üst bar'daki şirket-adı butonundan
    // (Activity widget) erişiliyor; menüde gereksiz. Yalnız App Store kalır.
    return [
      { ...coreApp, id: "store", name: t("appStore"), icon: Store01Icon, color: "#0a84ff", href: coreApp.href, logoUrl: "/os-app-icons/store.webp" },
    ]
  }, [coreApp, t])
  // Launchpad — kurulu tüm app'lerin ızgarası (macOS Launchpad). Dock'ta ilk
  // sırada, stage'de penceresi LaunchpadApps olarak render edilir.
  const launchpadApp = useMemo<AppDescriptor | null>(() => {
    if (!coreApp) return null
    return { ...coreApp, id: "launchpad", name: t("launchpad"), icon: GridViewIcon, color: "#5e5ce6", href: coreApp.href, logoUrl: "/os-app-icons/launchpad.webp" }
  }, [coreApp, t])
  // Notlar — OS-native app (WindowManager `<NotesApp>` render eder). Header app
  // launcher grid'ine girmez (OS-local, coreApp'ten türetilir); href kullanılmaz.
  const notesApp = useMemo<AppDescriptor | null>(() => {
    if (!coreApp) return null
    return { ...coreApp, id: "notes", name: t("notes.appName"), icon: StickyNote01Icon, color: "#f59e0b", href: coreApp.href, logoUrl: "/os-app-icons/notes.webp" }
  }, [coreApp, t])
  // Başarımlar — OS-native pencere (WindowManager `<AchievementsApp>`). Dock'ta
  // ve stageApps'te YOK; yalnız masaüstü widget'ından dynamicApps descriptor'ıyla
  // açılır (açıkken dock "çalışan" bölümünde görünür).
  const achievementsApp = useMemo<AppDescriptor | null>(() => {
    if (!coreApp) return null
    return { ...coreApp, id: "achievements", name: t("achievements.appName"), icon: ChampionIcon, color: "#f59e0b", href: coreApp.href }
  }, [coreApp, t])
  const stageApps = useMemo(
    () => [
      ...productApps,
      ...systemScreens,
      ...(notesApp ? [notesApp] : []),
      ...(launchpadApp ? [launchpadApp] : []),
    ],
    [productApps, systemScreens, notesApp, launchpadApp],
  )

  // Masaüstü tercihlerini (wallpaper/dock/widget) DB'den hydrate + write-through.
  // availableAppIds yeni-hesap widget seed'inde permGate için kullanılır.
  const availableAppIds = useMemo(() => stageApps.map((a) => a.id), [stageApps])
  useOsPrefsSync(activeSlug, availableAppIds)
  // Electron masaüstü uygulamasında yeni mail için native bildirim (VAPID
  // Electron'da çalışmaz; tarayıcıda no-op). Bkz. use-mail-desktop-notify.
  useMailDesktopNotify()

  const windows = useOsStore((s) => s.windows)
  const activeId = useOsStore((s) => s.activeId)
  const dynamicApps = useOsStore((s) => s.dynamicApps)
  const openApp = useOsStore((s) => s.openApp)
  const focusWindow = useOsStore((s) => s.focusWindow)
  const minimizeWindow = useOsStore((s) => s.minimizeWindow)
  const closeWindow = useOsStore((s) => s.closeWindow)
  const toggleShowDesktop = useOsStore((s) => s.toggleShowDesktop)
  const reset = useOsStore((s) => s.reset)
  const sweepIdle = useOsStore((s) => s.sweepIdle)
  const activeSpace = useOsStore((s) => s.activeSpace)
  const settingsOpen = useOsStore((s) => s.settingsOpen)
  const settingsCategory = useOsStore((s) => s.settingsCategory)
  const openSettings = useOsStore((s) => s.openSettings)
  const closeSettings = useOsStore((s) => s.closeSettings)
  const [createOpen, setCreateOpen] = useState(false)
  const [spotlightOpen, setSpotlightOpen] = useState(false)
  // Launchpad artık pencere değil — Apple tarzı tam-ekran overlay.
  const [launchpadOpen, setLaunchpadOpen] = useState(false)
  // Şirket URL'inden gelindiyse Activity widget'ı otomatik açılır.
  const [widgetView, setWidgetView] = useState<WidgetView>(initialCompanySlug ? "activity" : null)
  // Aktif şirkette kurulu App Store uygulamaları (Launchpad "Your apps").
  const [storeApps, setStoreApps] = useState<AppDescriptor[]>([])

  useEffect(() => {
    const id = setInterval(() => sweepIdle(), 30_000)
    return () => clearInterval(id)
  }, [sweepIdle])

  // Billing deep-link (/d/[slug]/billing) → aktif şirket çözülünce System
  // Settings'i ilgili sekmede aç (bir kez). Polar checkout başarı URL'i de
  // buraya döndüğünden plan yükseltme sonrası kullanıcı OS'ta kalır (web
  // görünümüne aktarılmaz) + ?checkout=success ise başarı toast'ı gösterilir.
  const deepSettingsRef = useRef(false)
  useEffect(() => {
    if (!initialSettingsCategory || !activeSlug || deepSettingsRef.current) return
    deepSettingsRef.current = true
    openSettings(initialSettingsCategory)
    try {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get("checkout") === "success") {
        toast.success(t("billingPane.checkoutSuccess"))
        // Tek seferlik — URL'i temizle (yeniden toast atmasın).
        window.history.replaceState(null, "", window.location.pathname)
      }
    } catch {
      /* ignore */
    }
  }, [initialSettingsCategory, activeSlug, openSettings, t])

  // App deep-link: `?os-app=<id>` ile bir uygulamayı OS penceresi olarak aç.
  // Mail bildirimine (VAPID push / native) tıklanınca mail subdomain'e değil
  // OS'a gelir + mail penceresi burada açılır. Apps async yüklendiğinden effect
  // stageApps değişince tekrar dener; ref bir kez açılmasını garanti eder.
  const deepAppRef = useRef(false)
  useEffect(() => {
    if (deepAppRef.current) return
    let appId: string | null = null
    try {
      appId = new URLSearchParams(window.location.search).get("os-app")
    } catch {
      /* ignore */
    }
    if (!appId) return
    const descriptor = stageApps.find((a) => a.id === appId) ?? dynamicApps[appId]
    if (!descriptor) return // henüz yüklenmedi ya da erişim yok → deps'te tekrar
    deepAppRef.current = true
    // Meet bildirimi doğrudan ODAYA götürür (`os-room`): statik descriptor
    // lobby'yi yüklediğinden (window-manager'da statik liste kazanır) per-launch
    // dynamic-id pencere açarız — href /call/<oda>, WindowFrame ?embed=1 ekler
    // ve meet shell embed modda prejoin'i atlayıp odaya girer.
    let room: string | null = null
    try {
      room = new URLSearchParams(window.location.search).get("os-room")
    } catch {
      /* ignore */
    }
    if (appId === "meet" && room && /^[a-z0-9-]{1,64}$/.test(room)) {
      const base = descriptor.href.replace(/\/$/, "")
      const d = {
        ...descriptor,
        id: `meet:${room}`,
        href: `${base}/call/${encodeURIComponent(room)}`,
      }
      openApp(d.id, d)
    } else if (appId === "storage") {
      // Storage bildirimi ("X seninle paylaştı") doğrudan dosyaya götürür:
      // /buckets/<bucket>?folder=…&file=… (onOpenStoragePath ile aynı desen).
      let bucket = ""
      let folder = ""
      let fileId = ""
      try {
        const sp = new URLSearchParams(window.location.search)
        bucket = sp.get("os-bucket") || ""
        folder = sp.get("os-folder") || ""
        fileId = sp.get("os-file") || ""
      } catch {
        /* ignore */
      }
      if (bucket && /^[a-z0-9-]{1,64}$/.test(bucket)) {
        const base = descriptor.href.replace(/\/$/, "")
        const qs = new URLSearchParams()
        if (folder) qs.set("folder", folder)
        if (fileId) qs.set("file", fileId)
        const query = qs.toString()
        const d = {
          ...descriptor,
          id: `storage:${bucket}:${folder}`,
          name: folder ? `Storage — ${folder}` : `Storage — ${bucket}`,
          href: `${base}/buckets/${encodeURIComponent(bucket)}${query ? `?${query}` : ""}`,
        }
        openApp(d.id, d)
      } else {
        openApp(appId, descriptor)
      }
    } else {
      openApp(appId, descriptor)
    }
    try {
      const u = new URL(window.location.href)
      u.searchParams.delete("os-app")
      u.searchParams.delete("os-mailbox")
      u.searchParams.delete("os-room")
      u.searchParams.delete("os-bucket")
      u.searchParams.delete("os-folder")
      u.searchParams.delete("os-file")
      window.history.replaceState(null, "", u.pathname + (u.search || ""))
    } catch {
      /* ignore */
    }
  }, [stageApps, dynamicApps, openApp])

  // Tools/Launchpad ilk açılışında "explore-tools" başarımını yerel işaretle
  // (client-tarafı sinyal; use-achievements EXPLORED_TOOLS_EVENT ile okur).
  const toolsExplored = windows.some((w) => w.appId === "tools") || launchpadOpen
  useEffect(() => {
    if (!toolsExplored) return
    try {
      if (localStorage.getItem(EXPLORED_TOOLS_LS_KEY) !== "1") {
        localStorage.setItem(EXPLORED_TOOLS_LS_KEY, "1")
        window.dispatchEvent(new Event(EXPLORED_TOOLS_EVENT))
      }
    } catch {
      /* ignore */
    }
  }, [toolsExplored])

  // OS tanıtım turu — ilk girişte bir kez otomatik (aktif şirket çözülünce,
  // menü bar/dock mount olsun diye kısa gecikme). Atlansa/bitse de tekrar açılmaz.
  const startTour = useOsTour()
  useEffect(() => {
    if (!activeSlug) return
    let done = false
    try {
      done = localStorage.getItem(OS_TOUR_DONE_KEY) === "1"
    } catch {
      /* ignore */
    }
    if (done) return
    const id = setTimeout(() => {
      try {
        localStorage.setItem(OS_TOUR_DONE_KEY, "1")
      } catch {
        /* ignore */
      }
      startTour()
    }, 900)
    return () => clearTimeout(id)
  }, [activeSlug, startTour])

  // Pencere içi bileşenlerden (Achievements "first-post" CTA) gelen widget-view
  // açma isteği — prop threading yerine event ile.
  useEffect(() => {
    const onView = (e: Event) => {
      const detail = (e as CustomEvent).detail as WidgetView
      if (detail === "activity" || detail === "widgets" || detail === "profile" || detail === "notifications") {
        setWidgetView(detail)
      }
    }
    window.addEventListener(WIDGET_VIEW_EVENT, onView)
    return () => window.removeEventListener(WIDGET_VIEW_EVENT, onView)
  }, [])

  // ⌘K / Ctrl+K → Spotlight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSpotlightOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Embed iframe'lerden (şirket profili/post-detay/kullanıcı profili) gelen
  // "şu dahili URL'i OS penceresinde aç" mesajları → yeni iframe penceresi.
  // Avatar/post tıklamasının iframe'i gezdirmesini (OS dışına atmasını) önler.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!isTrustedOsOrigin(e.origin)) return
      const d = e.data as { type?: string; url?: string; title?: string } | null
      if (!d || d.type !== "sentroy-os:open" || typeof d.url !== "string") return
      if (!d.url.startsWith("/")) return // yalnız dahili (relative) path
      openApp(`osopen:${d.url}`, osOpenDescriptor(d.url, typeof d.title === "string" ? d.title : ""))
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [openApp])

  // Dock badge'i için mail okunmamış sayısı — core→mail rewrite üzerinden.
  useEffect(() => {
    if (!activeSlug) return
    let cancelled = false
    const fetchUnread = async () => {
      try {
        const res = await fetch(`/api/mail/companies/${activeSlug}/inbox/unread-count`)
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        useNotificationsStore.getState().setInboxUnreadCount((json?.data?.count as number) ?? 0)
      } catch {
        /* sessiz — ağ hatası badge'i bozmasın */
      }
    }
    void fetchUnread()
    const id = setInterval(fetchUnread, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [activeSlug])

  // Kurulu App Store uygulamalarını çek → store descriptor'larına çevir.
  const loadStoreApps = useCallback(async () => {
    if (!activeSlug) return
    try {
      const res = await fetch(`/api/app-store/installed?company=${encodeURIComponent(activeSlug)}`)
      if (!res.ok) return
      const json = await res.json()
      // First-party gating id listesi (aynı fetch besler).
      setFirstPartyInstalled((json?.data?.firstPartyIds as string[]) ?? [])
      type Installed = {
          appId: string
          name: string
          logoUrl: string
          color: string
          embedUrl: string
          authMode: "none" | "token" | "oauth"
          sandboxAttr: string
          allowAttr: string
          injectedParams: string[]
          supportedLangs: string[]
          fallbackLang: string
          minHeight: number | null
        }
        const list = (json?.data?.apps as Installed[]) ?? []
        setStoreApps(
          list.map((a) => ({
            id: `store:${a.appId}`,
            name: a.name,
            description: "",
            cta: "",
            icon: Store01Icon,
            color: a.color,
            href: a.embedUrl,
            logoUrl: a.logoUrl,
            kind: "store" as const,
            embed: {
              appId: a.appId,
              sandbox: a.sandboxAttr,
              allow: a.allowAttr,
              injectedParams: a.injectedParams,
              authMode: a.authMode,
              companySlug: activeSlug,
              supportedLangs: a.supportedLangs,
              fallbackLang: a.fallbackLang,
              minHeight: a.minHeight,
            },
          })),
        )
    } catch {
      /* sessiz */
    }
  }, [activeSlug])

  // İlk yükleme + şirket değişimi; ve install/uninstall sonrası canlı tazele.
  useEffect(() => {
    void loadStoreApps()
    const onChange = () => void loadStoreApps()
    window.addEventListener("sentroy:apps-changed", onChange)
    return () => window.removeEventListener("sentroy:apps-changed", onChange)
  }, [loadStoreApps])

  function selectSlug(slug: string) {
    if (slug === activeSlug) return
    // Eski şirketin bekleyen tercih patch'lerini kaybetmeden gönder.
    flushAllPrefs()
    try {
      localStorage.setItem(LS_KEY, slug)
    } catch {
      /* ignore */
    }
    reset() // tab'lar eski şirkete aitti
    setActiveSlug(slug)
  }
  function switchCompany(c: OsCompany) {
    selectSlug(c.slug)
  }

  const openIds = useMemo(() => new Set(windows.map((w) => w.appId)), [windows])

  // Dock = ürün app'leri + pinli araçlar/indiriciler (reorder edilebilir).
  // Pinli item'lar kapalıyken de dock'ta kalır; açık olup pinli/ürün olmayan
  // app'ler ise divider'dan sonra "çalışan" bölümünde gösterilir.
  const pinned = useDockPinStore((s) => s.pinned)
  // Kullanıcının dock'tan kaldırdığı ürün/sistem app'leri. Launchpad'den geri eklenir.
  const hidden = useDockPinStore((s) => s.hidden)
  const dockApps = useMemo<AppDescriptor[]>(() => {
    const hiddenSet = new Set(hidden)
    const pinnedApps = pinned
      .map((id) => dynamicApps[id] ?? resolveDockId(id, lang))
      .filter((a): a is AppDescriptor => Boolean(a))
    // App Store dock'ta sabit (macOS gibi) — ürün app'lerinden sonra, pinli'den önce.
    // Launchpad en başta (macOS Dock konvansiyonu) ve asla gizlenemez.
    const store = systemScreens.find((s) => s.id === "store")
    return [
      ...(launchpadApp ? [launchpadApp] : []),
      ...productApps.filter((a) => !hiddenSet.has(a.id)),
      ...(notesApp && !hiddenSet.has(notesApp.id) ? [notesApp] : []),
      ...(store && !hiddenSet.has(store.id) ? [store] : []),
      ...pinnedApps,
    ]
  }, [productApps, pinned, hidden, dynamicApps, lang, systemScreens, launchpadApp, notesApp])
  const runningApps = useMemo<AppDescriptor[]>(() => {
    const dockIds = new Set(dockApps.map((a) => a.id))
    return windows
      .filter((w) => !dockIds.has(w.appId))
      .map((w) => stageApps.find((a) => a.id === w.appId) ?? dynamicApps[w.appId] ?? null)
      .filter((a): a is AppDescriptor => Boolean(a))
  }, [windows, dockApps, stageApps, dynamicApps])

  // Dock tıklaması — macOS davranışı:
  //  • pencere yoksa → aç (descriptor'ı da ver: pinli ama açılmamış araç/indirici
  //    pencerelerinin descriptor'ı store'a kaydedilsin, aksi halde iframe çözülemez)
  //  • minimize ise → restore + öne getir
  //  • zaten en öndeyse (aktif + görünür) → minimize et
  //  • açık ama en önde değilse → öne getir
  const openDockApp = useCallback(
    (id: string) => {
      // Launchpad pencere açmaz — tam-ekran overlay'i aç/kapat.
      if (id === "launchpad") {
        setLaunchpadOpen((o) => !o)
        return
      }
      const win = windows.find((w) => w.appId === id)
      if (!win) {
        const d = dockApps.find((a) => a.id === id) ?? runningApps.find((a) => a.id === id)
        openApp(id, d)
        return
      }
      if (win.minimized) {
        focusWindow(id)
      } else if (activeId === id) {
        // macOS: aktif tam ekran space app'inin kendi dock ikonu space'i minimize
        // edip yok ETMEZ — space'inde kalır (focus). Normal pencerede minimize.
        if (win.fullscreen) focusWindow(id)
        else minimizeWindow(id)
      } else {
        focusWindow(id)
      }
    },
    [windows, activeId, dockApps, runningApps, openApp, focusWindow, minimizeWindow],
  )

  // Hiç şirket yok → OS "first-run" ekranı (wallpaper + minimal top-bar + cam
  // "workspace oluştur" hero). Düz şirket-seçim yerine OS'a giriş hissi.
  if (loaded && companies.length === 0) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-neutral-900">
        <WallpaperLayer />
        <FirstRun lang={lang} user={user} onCreated={(slug) => selectSlug(slug)} />
      </div>
    )
  }

  return (
    // z-50 + stacking context → şirket dashboard shell'inin (sidebar vb.) üstünü
    // tamamen kaplar. /d/[slug]'de OS bu shell'in içinde render olur; shell
    // arkada kalır (overview dokümanında context kullanılmaz, billing iframe
    // ayrı dokümanda kendi shell'ini alır).
    <div className="fixed inset-0 z-50 overflow-hidden bg-neutral-900">
      <WallpaperLayer />
      {!active ? (
        // Şirketler yüklenirken / aktif çözülürken — duvar kâğıdı üstünde splash.
        <div className="relative z-10 flex h-full items-center justify-center">
          <span className="animate-pulse text-sm text-white/80 drop-shadow">{t("loadingWorkspace")}</span>
        </div>
      ) : (
        <>
          {/* Masaüstü tıklama yakalayıcı (pencerelerin ALTINDA, z-0) — boş alana
              tıklayınca tüm görünür pencereleri gizle (show-desktop); sağ-tık →
              widget context menu. Pencere/widget frame'leri kendi tıklamalarını
              yakalar; yalnız boş masaüstü buraya düşer. */}
          <DesktopContextMenu
            showDesktopLabel={t("showDesktop")}
            onShowDesktop={() => toggleShowDesktop()}
            onAddWidget={() => setWidgetView("widgets")}
          />
          <WindowManager apps={stageApps} storeApps={storeApps} lang={lang} isAdmin={isAdmin} companySlug={activeSlug ?? ""} />
          {/* Yüzen not widget'ları — pencerelerin üstünde (z-20) sticky-note tarzı. */}
          <NoteWidgetLayer
            slug={activeSlug ?? ""}
            onOpenNotes={() => openApp("notes", notesApp ?? undefined)}
          />
          <DesktopUpgradeCard slug={activeSlug} onUpgrade={() => openSettings("billing")} />
          {/* Masaüstü widget platformu — sürüklenebilir cam kartlar (achievements
              dahil; galeri WidgetPanel "Widgets" sekmesinde). z-[5], pencere altı. */}
          <DesktopWidgetLayer
            slug={activeSlug ?? ""}
            lang={lang}
            apps={stageApps}
            onOpenAchievements={() => {
              if (achievementsApp) openApp("achievements", achievementsApp)
            }}
            onOpenStoragePath={(bucket, folder, fileId) => {
              // Storage app descriptor'ından türet (href = storage kökü/dashPath);
              // /buckets/<bucket>?folder=…&file=… ekleyip plain-iframe pencere
              // olarak aç (tools/opencut dinamik descriptor deseni). Pencere id'si
              // bucket+folder'a bağlı → aynı klasöre tekrar tıklayınca öne gelir.
              const storageApp = stageApps.find((a) => a.id === "storage")
              if (!storageApp) return
              const qs = new URLSearchParams()
              if (folder) qs.set("folder", folder)
              if (fileId) qs.set("file", fileId)
              const query = qs.toString()
              const href = `${storageApp.href}/buckets/${encodeURIComponent(bucket)}${query ? `?${query}` : ""}`
              const id = `storage:${bucket}:${folder}`
              openApp(id, {
                ...storageApp,
                id,
                name: folder ? `Storage — ${folder}` : `Storage — ${bucket}`,
                href,
              })
            }}
          />
          {/* Bildirim store'unu besler (hydrateFromServer → Linear + davet
              bildirimleri; mail-delivered SSE). UI render etmez; menu-bar bell
              + WidgetPanel notifications view bu store'u okur. */}
          <NotificationsProvider />
          {/* "Uygulamayı indir" promo — Electron/PWA'da otomatik gizlenir. */}
          <GetAppPopup lang={lang} />
          <div className="absolute inset-x-0 top-0 z-30">
            <MenuBar
              lang={lang}
              active={active}
              user={user}
              systemScreens={systemScreens}
              onOpenSettings={openSettings}
              onOpenApp={openApp}
              onOpenSpotlight={() => setSpotlightOpen(true)}
              onToggleWidgets={() => setWidgetView((v) => (v === "activity" ? null : "activity"))}
              onOpenProfile={() => setWidgetView("profile")}
              onOpenNotifications={() => setWidgetView((v) => (v === "notifications" ? null : "notifications"))}
              onOpenAchievements={() => {
                if (achievementsApp) openApp("achievements", achievementsApp)
              }}
              onStartTour={startTour}
            />
          </div>
          <Dock dockApps={dockApps} runningApps={runningApps} openIds={openIds} activeId={activeId} onOpen={openDockApp} onClose={closeWindow} fullscreen={!!activeSpace} />
          {settingsOpen ? (
            <SettingsWindow
              lang={lang}
              companySlug={activeSlug ?? ""}
              user={user}
              initialCategory={settingsCategory}
              onClose={closeSettings}
              onCompanyDeleted={() => {
                closeSettings()
                reset()
                setActiveSlug(null)
                void useCompanyStore.getState().fetchCompanies(true)
              }}
            />
          ) : null}
          <CreateCompanyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={selectSlug} />
          <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} apps={stageApps} lang={lang} />
          <LaunchpadOverlay
            open={launchpadOpen}
            apps={stageApps}
            storeApps={storeApps}
            onOpen={(d) => {
              openApp(d.id, d)
              setLaunchpadOpen(false)
            }}
            onClose={() => setLaunchpadOpen(false)}
          />
          <WidgetPanel
            lang={lang}
            slug={activeSlug}
            user={user}
            view={widgetView}
            onClose={() => setWidgetView(null)}
            onViewChange={setWidgetView}
            companies={companies}
            active={active}
            onSwitch={switchCompany}
            onCreateCompany={() => setCreateOpen(true)}
            apps={stageApps}
          />
          {/* OS tanıtım turu + başarım ipuçları — her şeyin üstünde (z-[80]). */}
          <TourOverlay
            labels={{
              next: t("tour.next"),
              back: t("tour.back"),
              skip: t("tour.skip"),
              done: t("tour.done"),
            }}
          />
        </>
      )}
    </div>
  )
}
