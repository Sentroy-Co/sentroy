"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AudioWaveIcon,
  Delete01Icon,
  Edit02Icon,
  Folder02Icon,
  FolderOpenIcon,
  FolderLibraryIcon,
  FolderTransferIcon,
  MoreHorizontalIcon,
  PulseIcon,
  Search01Icon,
  Upload04Icon,
  Cancel01Icon,
  Add01Icon,
  ArrowLeft01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import { cn } from "@workspace/ui/lib/utils"
import { confirm } from "@workspace/console/stores/confirm"
import { promptInput } from "@/components/common/input-dialog"
import { useDjStore } from "@/lib/dj-store"
import { useLocalFiles, initLocalFiles } from "@/lib/local-files"
import { useShallow } from "zustand/react/shallow"

/**
 * In-flow sol sidebar — bir DOSYA YÖNETİCİSİ gibi kurgulanmış sample browser.
 *
 * `open` prop'una göre `w-72 → w-0` smooth transition. Editor layout'ta
 * decks'in soluna oturur; kapanınca decks tam genişler.
 *
 * File-manager davranışı:
 *   - `currentPath` ile klasöre gir/çık (breadcrumb + folder tile'ları).
 *     Kök ("") = "All". Alt klasörler asset.folder slash-path'lerinden türer.
 *   - Dosyalar ikon-grid tile: üstte dalga ikonu, altında ad, altında bpm/uzunluk.
 *   - Sağ-tık (context menu) VEYA ⋯ (dot) aynı aksiyonları açar:
 *       Rename · Move to folder (klasörler alt-item) · Get info · Delete.
 *   - Boş alan sağ-tık: New folder / Upload / Refresh. Klasör sağ-tık:
 *       Open / Rename / Move to folder / Delete folder (içindekilerle).
 *   - Çoklu seçim: click = tek, Cmd/Ctrl+click = toggle, Shift+click =
 *     aralık. Seçim varken altta action bar (Move to folder · Delete · Clear).
 *     Toplu işlemler mevcut tekil API'ler üzerinden sıralı client-side döngü.
 *   - Upload: bulunulan klasöre gider; ayrı drop-zone yok — kütüphaneye
 *     sürüklenen ses dosyaları yüklenir + search yanında upload butonu.
 *
 * Sample sürükle (`application/x-studio-asset` MIME):
 *   - deck waveform'una bırak → load (mediaId cached, re-upload yok)
 *   - queue popover'a bırak → enqueue
 *   - ÇOKLU SEÇİM sürüklenirse payload `items[]` ile tüm seçimi taşır;
 *     timeline her dosyayı ayrı track'e yerleştirir (deck consumer'ları
 *     tekil top-level alanları okumaya devam eder — geriye dönük uyumlu).
 */

export const LIBRARY_DRAG_MIME = "application/x-studio-asset"

/** Library drag payload'ı — tekil alanlar sürüklenen öğe; `items` çoklu
 *  seçimde TÜM seçimi taşır (sürüklenen öğe ilk sırada). */
export interface LibraryDragItem {
  mediaId: string
  label: string
  bpm: number | null
  key: string | null
  duration: number | null
}
export interface LibraryDragPayload extends LibraryDragItem {
  items?: LibraryDragItem[]
}

// Library'nin o an açık (hedef) klasörü — timeline'a direkt OS dosyası
// bırakıldığında import aynı klasöre gitsin diye modül-level yayınlanır
// (editor başına tek sidebar instance'ı; default "samples").
let publishedTargetFolder = "samples"
export function getLibraryTargetFolder(): string {
  return publishedTargetFolder
}

interface LibraryAsset {
  mediaId: string
  fileName: string
  originalName: string
  mimeType: string
  size: number
  folder: string
  createdAt: string
  bpm: number | null
  key: string | null
  duration: number | null
  /** true → dosya yalnız bu cihazda (IndexedDB); cloud'a proje sync'iyle gider. */
  local?: boolean
}

/** Klasör path'ini normalize et — baş/son slash + çoklu slash temizliği. */
function normalizeFolder(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/")
}

export function LibrarySidebar({
  open,
  onOpenChange,
  companySlug,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  companySlug: string
}) {
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [dragOver, setDragOver] = useState(false)
  // Bulunulan klasör — "" = All (kök). Alt klasörlere girip çıkılır.
  const [currentPath, setCurrentPath] = useState("")
  const [infoAsset, setInfoAsset] = useState<LibraryAsset | null>(null)
  // Session-lokal boş klasörler — asset.folder'dan türetilemeyen (henüz
  // içine dosya konmamış) "New folder" ile yaratılmış path'ler. İçine
  // dosya taşınınca server-side kalıcılaşır.
  const [extraFolders, setExtraFolders] = useState<Set<string>>(() => new Set())
  // Çoklu seçim — mediaId set'i. Shift aralığı için son anchor tutulur.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const lastAnchorRef = useRef<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // "In use" mediaId set — herhangi bir deck'e yüklenmiş VEYA queue'da olan.
  const inUseMediaIds = useDjStore(
    useShallow((s): Set<string> => {
      const out = new Set<string>()
      const decks = s.tree.decks
      for (const id of Object.keys(decks)) {
        const d = decks[id]
        if (!d) continue
        if (d.loadedMediaId) out.add(d.loadedMediaId)
        for (const q of d.queue ?? []) {
          if (q.mediaId) out.add(q.mediaId)
        }
      }
      return out
    }),
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      // TÜM asset'leri yükle (folder filtresi yok) — file-manager klasör
      // yapısını client-side türetir. limit 500 studio için fazlasıyla yeterli.
      const res = await fetch(
        `/api/companies/${companySlug}/studio/assets?limit=500`,
        { credentials: "include" },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setAssets(json.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Library failed to load")
    } finally {
      setLoading(false)
    }
  }, [companySlug])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  // ─── LOCAL-FIRST dosyalar — IndexedDB'den hydrate + sunucu listesiyle
  // aynı görünümde birleştir. Lokal dosyalar "local" rozetiyle ayrışır. ───
  const localItems = useLocalFiles((s) => s.items)
  useEffect(() => {
    void initLocalFiles(companySlug)
  }, [companySlug])

  const localAsAssets = useMemo<LibraryAsset[]>(
    () =>
      localItems.map((it) => ({
        mediaId: it.id,
        fileName: it.name,
        originalName: it.name,
        mimeType: it.mimeType,
        size: it.size,
        folder: it.folder,
        createdAt: it.createdAt,
        bpm: null,
        key: null,
        duration: it.durationSec,
        local: true,
      })),
    [localItems],
  )

  // Tek birleşik liste — tüm türetmeler (klasörler, arama, seçim, sayaçlar)
  // bunun üzerinden akar; lokal/sunucu ayrımı yalnız işlem anında yapılır.
  const combined = useMemo(
    () => [...localAsAssets, ...assets],
    [localAsAssets, assets],
  )

  // ─── Seçim state hijyeni ──────────────────────────────────────────────
  // Klasör değişince / arama değişince seçim sıfırlanır (aralık seçimi
  // görünür sıraya bağlı olduğu için taşınamaz).
  useEffect(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()))
    lastAnchorRef.current = null
  }, [currentPath, search])

  // Asset listesi değişince (silme/refresh/migrate) hayalet seçimleri temizle.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const valid = new Set(combined.map((a) => a.mediaId))
      let dirty = false
      const next = new Set<string>()
      for (const id of prev) {
        if (valid.has(id)) next.add(id)
        else dirty = true
      }
      return dirty ? next : prev
    })
  }, [combined])

  const clearSelection = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()))
    lastAnchorRef.current = null
  }, [])

  // ─── Tekil asset işlemleri ────────────────────────────────────────────
  const deleteAsset = useCallback(
    async (asset: LibraryAsset) => {
      const inUse = inUseMediaIds.has(asset.mediaId)
      const ok = await confirm({
        title: `Delete "${asset.originalName}"?`,
        description: asset.local
          ? inUse
            ? "This local sample is currently loaded on a deck or queued. It will be removed from this device — decks keep the cached buffer but cannot reload it."
            : "This file is stored only on this device and will be removed permanently."
          : inUse
            ? "This sample is currently loaded on a deck or queued. Decks keep the cached buffer but cannot reload it. This cannot be undone."
            : "The sample will be permanently deleted. This cannot be undone.",
        confirmText: "Delete",
        destructive: true,
      })
      if (!ok) return
      // Lokal dosya — IndexedDB kaydı (blob dahil) silinir, sunucu çağrısı yok
      if (asset.local) {
        await useLocalFiles.getState().remove(asset.mediaId)
        toast.success(`Deleted ${asset.originalName}`)
        return
      }
      try {
        const res = await fetch(
          `/api/companies/${companySlug}/studio/assets/${asset.mediaId}`,
          { method: "DELETE", credentials: "include" },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        toast.success(`Deleted ${asset.originalName}`)
        setAssets((cur) => cur.filter((a) => a.mediaId !== asset.mediaId))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed")
      }
    },
    [companySlug, inUseMediaIds],
  )

  const renameAsset = useCallback(
    async (asset: LibraryAsset) => {
      const raw = await promptInput({
        title: "Rename file",
        label: "File name",
        defaultValue: asset.originalName,
        confirmText: "Rename",
      })
      const name = raw?.trim()
      if (!name || name === asset.originalName) return
      if (asset.local) {
        await useLocalFiles.getState().patchMeta(asset.mediaId, { name })
        toast.success(`Renamed to "${name}"`)
        return
      }
      try {
        const res = await fetch(
          `/api/companies/${companySlug}/studio/assets/${asset.mediaId}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ originalName: name }),
          },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        toast.success(`Renamed to "${name}"`)
        setAssets((cur) =>
          cur.map((a) =>
            a.mediaId === asset.mediaId ? { ...a, originalName: name } : a,
          ),
        )
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Rename failed")
      }
    },
    [companySlug],
  )

  const moveAsset = useCallback(
    async (asset: LibraryAsset, targetFolder: string) => {
      const folder = normalizeFolder(targetFolder)
      if (!folder || folder === asset.folder) return
      if (asset.local) {
        await useLocalFiles.getState().patchMeta(asset.mediaId, { folder })
        toast.success(`Moved to "${folder}"`)
        return
      }
      try {
        const res = await fetch(
          `/api/companies/${companySlug}/studio/assets/${asset.mediaId}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder }),
          },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        toast.success(`Moved to "${folder}"`)
        await refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Move failed")
      }
    },
    [companySlug, refresh],
  )

  // Tüm bilinen klasör yolları (move submenu için) — her zaman "samples".
  const allFolders = useMemo(() => {
    const s = new Set<string>(["samples"])
    for (const a of combined) if (a.folder) s.add(a.folder)
    for (const f of extraFolders) s.add(f)
    return Array.from(s).sort()
  }, [combined, extraFolders])

  // ─── File-manager türetmeleri ──
  const prefix = currentPath ? currentPath + "/" : ""
  const subfolders = useMemo(() => {
    const set = new Set<string>()
    const addPath = (f: string) => {
      if (!f) return
      if (currentPath === "") {
        const seg = f.split("/")[0]
        if (seg) set.add(seg)
      } else if (f.startsWith(prefix)) {
        const seg = f.slice(prefix.length).split("/")[0]
        if (seg) set.add(currentPath + "/" + seg)
      }
    }
    for (const a of combined) addPath(a.folder || "")
    for (const f of extraFolders) addPath(f)
    return Array.from(set).sort()
  }, [combined, extraFolders, currentPath, prefix])

  const searching = search.trim().length > 0
  const filesHere = useMemo(() => {
    if (searching) {
      const q = search.toLowerCase().trim()
      return combined.filter((a) => a.originalName.toLowerCase().includes(q))
    }
    return combined.filter((a) => (a.folder || "") === currentPath)
  }, [combined, currentPath, search, searching])

  // Bir klasör (ve altındaki) toplam dosya sayısı — folder tile badge.
  const folderCount = useCallback(
    (path: string) =>
      combined.filter(
        (a) => (a.folder || "") === path || (a.folder || "").startsWith(path + "/"),
      ).length,
    [combined],
  )

  // ─── Çoklu seçim ──────────────────────────────────────────────────────
  const handleTileSelect = useCallback(
    (mediaId: string, e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        // Toggle
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(mediaId)) next.delete(mediaId)
          else next.add(mediaId)
          return next
        })
        lastAnchorRef.current = mediaId
      } else if (e.shiftKey && lastAnchorRef.current) {
        // Aralık — görünür dosya sırası (filesHere) üzerinden
        const order = filesHere.map((a) => a.mediaId)
        const a = order.indexOf(lastAnchorRef.current)
        const b = order.indexOf(mediaId)
        if (a === -1 || b === -1) {
          setSelectedIds(new Set([mediaId]))
          lastAnchorRef.current = mediaId
          return
        }
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelectedIds(new Set(order.slice(lo, hi + 1)))
        // Anchor korunur — dosya yöneticisi standardı
      } else {
        setSelectedIds(new Set([mediaId]))
        lastAnchorRef.current = mediaId
      }
    },
    [filesHere],
  )

  const selectedAssets = useMemo(
    () => combined.filter((a) => selectedIds.has(a.mediaId)),
    [combined, selectedIds],
  )

  // Çoklu seçim drag payload'ı — seçili tile sürüklenirse tüm seçim taşınır
  // (timeline dosya başına ayrı track açar). Görünür sıra korunur.
  const multiDragItems = useMemo<LibraryDragItem[]>(
    () =>
      selectedAssets.map((a) => ({
        mediaId: a.mediaId,
        label: a.originalName,
        bpm: a.bpm,
        key: a.key,
        duration: a.duration,
      })),
    [selectedAssets],
  )

  // ─── Toplu işlemler — tekil API'ler üzerinden sıralı client-side döngü ──
  const bulkMoveSelected = useCallback(
    async (targetFolder: string) => {
      const folder = normalizeFolder(targetFolder)
      if (!folder || selectedAssets.length === 0) return
      setBulkBusy(true)
      let ok = 0
      let fail = 0
      for (const a of selectedAssets) {
        if ((a.folder || "") === folder) {
          ok++
          continue
        }
        // Lokal dosya — IndexedDB meta patch, sunucu çağrısı yok
        if (a.local) {
          try {
            await useLocalFiles.getState().patchMeta(a.mediaId, { folder })
            ok++
          } catch {
            fail++
          }
          continue
        }
        try {
          const res = await fetch(
            `/api/companies/${companySlug}/studio/assets/${a.mediaId}`,
            {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folder }),
            },
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          ok++
        } catch {
          fail++
        }
      }
      setBulkBusy(false)
      if (ok > 0)
        toast.success(`Moved ${ok} file${ok === 1 ? "" : "s"} to "${folder}"`)
      if (fail > 0) toast.error(`${fail} move${fail === 1 ? "" : "s"} failed`)
      clearSelection()
      await refresh()
    },
    [companySlug, selectedAssets, clearSelection, refresh],
  )

  const bulkDeleteSelected = useCallback(async () => {
    const n = selectedAssets.length
    if (n === 0) return
    const inUseCount = selectedAssets.filter((a) =>
      inUseMediaIds.has(a.mediaId),
    ).length
    const ok = await confirm({
      title: `Delete ${n} file${n === 1 ? "" : "s"}?`,
      description:
        inUseCount > 0
          ? `${inUseCount} of them ${inUseCount === 1 ? "is" : "are"} currently loaded on a deck or queued. Decks keep the cached buffer but cannot reload. This cannot be undone.`
          : "The selected samples will be permanently deleted. This cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    })
    if (!ok) return
    setBulkBusy(true)
    let done = 0
    let fail = 0
    const deleted = new Set<string>()
    for (const a of selectedAssets) {
      // Lokal dosya — IndexedDB kaydı (blob dahil) silinir
      if (a.local) {
        try {
          await useLocalFiles.getState().remove(a.mediaId)
          done++
        } catch {
          fail++
        }
        continue
      }
      try {
        const res = await fetch(
          `/api/companies/${companySlug}/studio/assets/${a.mediaId}`,
          { method: "DELETE", credentials: "include" },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        deleted.add(a.mediaId)
        done++
      } catch {
        fail++
      }
    }
    setBulkBusy(false)
    if (done > 0)
      toast.success(`Deleted ${done} file${done === 1 ? "" : "s"}`)
    if (fail > 0)
      toast.error(`${fail} delete${fail === 1 ? "" : "s"} failed`)
    setAssets((cur) => cur.filter((a) => !deleted.has(a.mediaId)))
    clearSelection()
  }, [companySlug, selectedAssets, inUseMediaIds, clearSelection])

  // ─── Klasör işlemleri ─────────────────────────────────────────────────
  const assetsUnder = useCallback(
    (path: string) =>
      combined.filter(
        (a) =>
          (a.folder || "") === path ||
          (a.folder || "").startsWith(path + "/"),
      ),
    [combined],
  )

  /** path altındaki tüm asset'lerin folder'ını newPath tabanına taşı. */
  const repathFolder = useCallback(
    async (path: string, newPath: string) => {
      const list = assetsUnder(path)
      let ok = 0
      let fail = 0
      for (const a of list) {
        const nf = newPath + (a.folder || "").slice(path.length)
        // Lokal dosya — IndexedDB meta patch
        if (a.local) {
          try {
            await useLocalFiles.getState().patchMeta(a.mediaId, { folder: nf })
            ok++
          } catch {
            fail++
          }
          continue
        }
        try {
          const res = await fetch(
            `/api/companies/${companySlug}/studio/assets/${a.mediaId}`,
            {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folder: nf }),
            },
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          ok++
        } catch {
          fail++
        }
      }
      // Session-lokal boş klasör path'lerini de taşı
      setExtraFolders((prev) => {
        const next = new Set<string>()
        for (const f of prev) {
          if (f === path || f.startsWith(path + "/"))
            next.add(newPath + f.slice(path.length))
          else next.add(f)
        }
        return next
      })
      return { ok, fail, total: list.length }
    },
    [assetsUnder, companySlug],
  )

  const createFolderHere = useCallback(async () => {
    const raw = await promptInput({
      title: "New folder",
      label: "Folder name",
      placeholder: "e.g. drums",
      description: currentPath
        ? `Created inside "${currentPath}". Folders persist once files are placed in them.`
        : "Created at the top level. Folders persist once files are placed in them.",
      confirmText: "Create",
    })
    const clean = normalizeFolder(raw)
    if (!clean) return
    const full = currentPath ? `${currentPath}/${clean}` : clean
    setExtraFolders((prev) => {
      const next = new Set(prev)
      next.add(full)
      return next
    })
    toast.success(`Folder "${full}" created — move or drop files into it`)
  }, [currentPath])

  const renameFolder = useCallback(
    async (path: string) => {
      const currentName = path.split("/").pop() ?? path
      const raw = await promptInput({
        title: "Rename folder",
        label: "Folder name",
        defaultValue: currentName,
        confirmText: "Rename",
      })
      const clean = normalizeFolder(raw)
      if (!clean || clean === currentName) return
      const parent = path.split("/").slice(0, -1).join("/")
      const newPath = parent ? `${parent}/${clean}` : clean
      const { fail, total } = await repathFolder(path, newPath)
      if (fail > 0) toast.error(`${fail} of ${total} files could not be moved`)
      else toast.success(`Folder renamed to "${newPath}"`)
      if (currentPath === path || currentPath.startsWith(path + "/")) {
        setCurrentPath(newPath + currentPath.slice(path.length))
      }
      await refresh()
    },
    [repathFolder, currentPath, refresh],
  )

  const moveFolderTo = useCallback(
    async (path: string, targetParent: string) => {
      const name = path.split("/").pop() ?? path
      const newPath = targetParent ? `${targetParent}/${name}` : name
      if (newPath === path) return
      const { fail, total } = await repathFolder(path, newPath)
      if (fail > 0) toast.error(`${fail} of ${total} files could not be moved`)
      else toast.success(`Folder moved to "${newPath}"`)
      if (currentPath === path || currentPath.startsWith(path + "/")) {
        setCurrentPath(newPath + currentPath.slice(path.length))
      }
      await refresh()
    },
    [repathFolder, currentPath, refresh],
  )

  const deleteFolder = useCallback(
    async (path: string) => {
      const name = path.split("/").pop() ?? path
      const list = assetsUnder(path)
      const ok = await confirm({
        title: `Delete folder "${name}"?`,
        description:
          list.length > 0
            ? `${list.length} file${list.length === 1 ? "" : "s"} inside will be permanently deleted. This cannot be undone.`
            : "The folder is empty and will be removed.",
        confirmText: "Delete",
        destructive: true,
      })
      if (!ok) return
      let fail = 0
      for (const a of list) {
        // Lokal dosya — IndexedDB kaydı (blob dahil) silinir
        if (a.local) {
          try {
            await useLocalFiles.getState().remove(a.mediaId)
          } catch {
            fail++
          }
          continue
        }
        try {
          const res = await fetch(
            `/api/companies/${companySlug}/studio/assets/${a.mediaId}`,
            { method: "DELETE", credentials: "include" },
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
        } catch {
          fail++
        }
      }
      // Boş (session-lokal) klasör kayıtlarını da düş
      setExtraFolders((prev) => {
        const next = new Set<string>()
        for (const f of prev) {
          if (f === path || f.startsWith(path + "/")) continue
          next.add(f)
        }
        return next
      })
      if (currentPath === path || currentPath.startsWith(path + "/")) {
        setCurrentPath(path.split("/").slice(0, -1).join("/"))
      }
      if (fail > 0) {
        toast.error(`${fail} file${fail === 1 ? "" : "s"} could not be deleted`)
      } else {
        toast.success(`Folder "${name}" deleted`)
      }
      await refresh()
    },
    [assetsUnder, companySlug, currentPath, refresh],
  )

  const targetFolder = currentPath || "samples"

  // Açık klasörü modül-level yayınla — timeline direkt-drop import'u okur.
  useEffect(() => {
    publishedTargetFolder = targetFolder
  }, [targetFolder])

  // LOCAL-FIRST: dosyalar SUNUCUYA GİTMEZ — IndexedDB blob store'una yazılır
  // ve anında kullanılabilir (objectURL). Cloud'a yükleme, projedeki
  // "Cloud sync / Upload local files" akışıyla yapılır.
  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("audio/"))
      if (list.length === 0) {
        toast.error("Audio files only")
        return
      }
      const added = await useLocalFiles.getState().addFiles(list, targetFolder)
      toast.success(
        `${added.length} sample${added.length === 1 ? "" : "s"} added to ${targetFolder} — stored on this device`,
      )
    },
    [targetFolder],
  )

  const segments = currentPath ? currentPath.split("/") : []
  const showEmpty =
    !loading && subfolders.length === 0 && filesHere.length === 0

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-r border-neutral-800 bg-neutral-950/60 transition-[width] duration-200 ease-out",
        open ? "w-72" : "w-0",
      )}
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-100">
              <HugeiconsIcon icon={FolderLibraryIcon} size={14} />
              Library
              <span className="ms-1 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
                {combined.length}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onOpenChange(false)}
              className="text-neutral-500 hover:text-neutral-100"
              title="Close"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </Button>
          </div>

          {/* Search + upload button */}
          <div className="flex items-center gap-1.5 border-b border-neutral-800 p-2">
            <div className="relative min-w-0 flex-1">
              <HugeiconsIcon
                icon={Search01Icon}
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <Input
                type="search"
                placeholder="Search samples…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 pl-7 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title={`Add audio → ${targetFolder} (stored on this device until synced)`}
              className="flex h-7 shrink-0 items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2 text-[11px] text-neutral-200 transition hover:border-pink-500/60 hover:bg-pink-500/10 hover:text-pink-200 disabled:opacity-40"
            >
              <HugeiconsIcon icon={Upload04Icon} size={12} />
              Add
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void uploadFiles(e.target.files)
                  e.target.value = ""
                }
              }}
            />
          </div>

          {/* Breadcrumb — arama modunda gizli */}
          {!searching && (
            <div className="flex items-center gap-0.5 overflow-x-auto border-b border-neutral-800/60 bg-neutral-950/40 px-2 py-1.5 text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {segments.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPath(segments.slice(0, -1).join("/"))
                  }
                  className="mr-0.5 flex size-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  title="Up"
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setCurrentPath("")}
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 transition hover:bg-neutral-800",
                  currentPath === "" ? "text-pink-200" : "text-neutral-400",
                )}
              >
                All
              </button>
              {segments.map((seg, i) => {
                const path = segments.slice(0, i + 1).join("/")
                const last = i === segments.length - 1
                return (
                  <Fragment key={path}>
                    <span className="shrink-0 text-neutral-600">/</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPath(path)}
                      className={cn(
                        "max-w-[120px] shrink-0 truncate rounded px-1.5 py-0.5 transition hover:bg-neutral-800",
                        last ? "text-pink-200" : "text-neutral-400",
                      )}
                    >
                      {seg}
                    </button>
                  </Fragment>
                )
              })}
            </div>
          )}

          {/* Body — dosya yöneticisi grid + tüm-alan drop target.
              Boş alan sağ-tık: New folder / Upload / Refresh (tile'lar kendi
              menülerinde stopPropagation yapar, bu menü yalnız boş alanda). */}
          <ContextMenu>
            <ContextMenuTrigger
              render={
                <div
                  className={cn(
                    "relative min-h-0 flex-1 overflow-y-auto p-2",
                    dragOver && "ring-2 ring-inset ring-pink-500/70",
                  )}
                  onClick={(e) => {
                    // Boş alana sol-tık → seçimi temizle (tile'lar data-tile)
                    const t = e.target as HTMLElement
                    if (!t.closest("[data-tile]")) clearSelection()
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("Files")) {
                      e.preventDefault()
                      setDragOver(true)
                    }
                  }}
                  onDragLeave={(e) => {
                    // Yalnız container'ı gerçekten terk edince kapat.
                    if (!e.currentTarget.contains(e.relatedTarget as Node))
                      setDragOver(false)
                  }}
                  onDrop={(e) => {
                    if (!e.dataTransfer.types.includes("Files")) return
                    e.preventDefault()
                    setDragOver(false)
                    // FileList SENKRON snapshot'lanır — DataTransfer event
                    // sonrası async erişim tarayıcıya göre güvenilmez
                    const files = Array.from(e.dataTransfer.files)
                    if (files.length > 0) void uploadFiles(files)
                  }}
                />
              }
            >
              {dragOver && (
                <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-pink-500 bg-neutral-950/80 text-[11px] text-pink-300">
                  <HugeiconsIcon icon={Upload04Icon} size={16} />
                  Drop audio → {targetFolder}
                </div>
              )}

              {loading ? (
                <div className="p-6 text-center text-xs text-neutral-500">
                  Loading…
                </div>
              ) : showEmpty ? (
                <div className="flex flex-col items-center gap-2 p-8 text-center text-xs text-neutral-500">
                  <HugeiconsIcon icon={FolderOpenIcon} size={22} strokeWidth={1.5} />
                  {searching
                    ? "No matches"
                    : currentPath
                      ? "Empty folder — drop audio or hit Add."
                      : "No samples yet. Drop audio or hit Add — files stay on this device until synced."}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {/* Klasörler (arama modunda gizli) */}
                  {!searching &&
                    subfolders.map((path) => (
                      <FolderTile
                        key={path}
                        path={path}
                        name={path.split("/").pop() ?? path}
                        count={folderCount(path)}
                        folders={allFolders}
                        onOpen={() => setCurrentPath(path)}
                        onRename={() => void renameFolder(path)}
                        onMoveTo={(parent) => void moveFolderTo(path, parent)}
                        onDelete={() => void deleteFolder(path)}
                      />
                    ))}
                  {/* Dosyalar */}
                  {filesHere.map((a) => (
                    <FileTile
                      key={a.mediaId}
                      asset={a}
                      inUse={inUseMediaIds.has(a.mediaId)}
                      selected={selectedIds.has(a.mediaId)}
                      // Tile seçiliyse menü aksiyonları TÜM seçime uygulanır
                      selectionCount={
                        selectedIds.has(a.mediaId) ? selectedIds.size : 0
                      }
                      multiDragItems={multiDragItems}
                      folders={allFolders}
                      showFolder={searching}
                      onSelectClick={(e) => handleTileSelect(a.mediaId, e)}
                      onMove={(folder) => void moveAsset(a, folder)}
                      onRename={() => void renameAsset(a)}
                      onDelete={() => void deleteAsset(a)}
                      onBulkMove={(folder) => void bulkMoveSelected(folder)}
                      onBulkDelete={() => void bulkDeleteSelected()}
                      onInfo={() => setInfoAsset(a)}
                    />
                  ))}
                </div>
              )}
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
              <ContextMenuItem onClick={() => void createFolderHere()}>
                <HugeiconsIcon icon={Add01Icon} size={11} />
                New folder…
              </ContextMenuItem>
              <ContextMenuItem onClick={() => fileInputRef.current?.click()}>
                <HugeiconsIcon icon={Upload04Icon} size={11} />
                Add audio…
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => void refresh()}>
                <HugeiconsIcon icon={FolderLibraryIcon} size={11} />
                Refresh library
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          {/* Seçim action bar'ı — N selected · Move to folder · Delete · Clear */}
          {selectedIds.size > 0 && (
            <div className="flex shrink-0 items-center gap-1 border-t border-neutral-800 bg-neutral-900/80 px-2 py-1.5 text-[11px]">
              <span className="min-w-0 flex-1 truncate font-medium text-neutral-200">
                {selectedIds.size} selected
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      disabled={bulkBusy}
                      title="Move selected files to a folder"
                      className="flex h-6 shrink-0 items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-1.5 text-[10px] text-neutral-200 transition hover:border-pink-500/60 hover:text-pink-200 disabled:opacity-40"
                    >
                      <HugeiconsIcon icon={FolderTransferIcon} size={11} />
                      Move
                    </button>
                  }
                />
                <DropdownMenuContent className="max-h-64 w-52 overflow-y-auto" align="end">
                  <DropdownMenuGroup>
                    {allFolders.map((f) => (
                      <DropdownMenuItem
                        key={f}
                        onClick={() => void bulkMoveSelected(f)}
                      >
                        <HugeiconsIcon
                          icon={Folder02Icon}
                          size={11}
                          className="text-neutral-400"
                        />
                        <span className="truncate">{f}</span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={async () => {
                        const name = await promptInput({
                          title: "New folder",
                          label: "Folder name",
                          placeholder: "e.g. drums/kicks",
                          description:
                            "Use slashes for nesting. Selected files will be moved into it.",
                          confirmText: "Move",
                        })
                        const clean = normalizeFolder(name)
                        if (clean) void bulkMoveSelected(clean)
                      }}
                    >
                      <HugeiconsIcon icon={Add01Icon} size={11} />
                      New folder…
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulkDeleteSelected()}
                title="Delete selected files"
                className="flex h-6 shrink-0 items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 text-[10px] text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
              >
                <HugeiconsIcon icon={Delete01Icon} size={11} />
                Delete
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={clearSelection}
                title="Clear selection"
                className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[10px] text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={11} />
                Clear
              </button>
            </div>
          )}

        </>
      )}

      {/* Get info dialog */}
      <Dialog open={!!infoAsset} onOpenChange={(o) => !o && setInfoAsset(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">
              {infoAsset?.originalName}
            </DialogTitle>
          </DialogHeader>
          {infoAsset && (
            <dl className="space-y-1.5 text-xs">
              <InfoRow
                label="Location"
                value={
                  infoAsset.local
                    ? "This device — syncs to cloud with the project"
                    : "Cloud"
                }
              />
              <InfoRow label="Folder" value={infoAsset.folder || "—"} />
              <InfoRow label="Size" value={fmtBytes(infoAsset.size)} />
              <InfoRow
                label="Duration"
                value={infoAsset.duration ? fmtTime(infoAsset.duration) : "—"}
              />
              <InfoRow
                label="BPM"
                value={infoAsset.bpm ? String(Math.round(infoAsset.bpm)) : "—"}
              />
              <InfoRow label="Key" value={infoAsset.key || "—"} />
              <InfoRow label="Type" value={infoAsset.mimeType} />
              <InfoRow
                label="Added"
                value={new Date(infoAsset.createdAt).toLocaleString()}
              />
              <InfoRow label="Media ID" value={infoAsset.mediaId} mono />
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-all text-right text-neutral-200",
          mono && "font-mono text-[10px]",
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function FolderTile({
  path,
  name,
  count,
  folders,
  onOpen,
  onRename,
  onMoveTo,
  onDelete,
}: {
  path: string
  name: string
  count: number
  /** Bilinen tüm klasör yolları — "Move to folder" hedefleri için. */
  folders: string[]
  onOpen(): void
  onRename(): void
  /** targetParent: "" = kök; klasör oraya alt klasör olarak taşınır. */
  onMoveTo(targetParent: string): void
  onDelete(): void
}) {
  const parentPath = path.split("/").slice(0, -1).join("/")
  // Kendisi, kendi altı ve mevcut parent hedef olamaz.
  const moveParents = folders.filter(
    (f) => f !== path && !f.startsWith(path + "/") && f !== parentPath,
  )
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            type="button"
            data-tile="1"
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
            onDoubleClick={onOpen}
            // İç menü açılırken dış (boş alan) menüsü tetiklenmesin
            onContextMenu={(e) => e.stopPropagation()}
            className="flex flex-col items-center gap-1 rounded-lg border border-transparent p-2 text-center transition hover:border-neutral-800 hover:bg-neutral-800/40"
            title={`Open "${name}"`}
          />
        }
      >
        <HugeiconsIcon icon={Folder02Icon} size={30} className="text-amber-400/80" />
        <span className="w-full truncate text-[11px] text-neutral-200">{name}</span>
        <span className="font-mono text-[9px] text-neutral-500">
          {count} item{count === 1 ? "" : "s"}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onOpen}>
          <HugeiconsIcon icon={FolderOpenIcon} size={11} />
          Open
        </ContextMenuItem>
        <ContextMenuItem onClick={onRename}>
          <HugeiconsIcon icon={Edit02Icon} size={11} />
          Rename…
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <HugeiconsIcon icon={FolderTransferIcon} size={11} />
            Move to folder
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-64 w-48 overflow-y-auto">
            <ContextMenuGroup>
              {parentPath !== "" && (
                <ContextMenuItem onClick={() => onMoveTo("")}>
                  <HugeiconsIcon
                    icon={FolderLibraryIcon}
                    size={11}
                    className="text-neutral-400"
                  />
                  All (top level)
                </ContextMenuItem>
              )}
              {moveParents.map((f) => (
                <ContextMenuItem key={f} onClick={() => onMoveTo(f)}>
                  <HugeiconsIcon
                    icon={Folder02Icon}
                    size={11}
                    className="text-neutral-400"
                  />
                  <span className="truncate">{f}</span>
                </ContextMenuItem>
              ))}
              {parentPath === "" && moveParents.length === 0 && (
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                  No other folders
                </div>
              )}
            </ContextMenuGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={onDelete}
          className="text-red-400 data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-300"
        >
          <HugeiconsIcon icon={Delete01Icon} size={11} />
          Delete folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function FileTile({
  asset,
  inUse,
  selected,
  selectionCount,
  multiDragItems,
  folders,
  showFolder,
  onSelectClick,
  onMove,
  onRename,
  onDelete,
  onBulkMove,
  onBulkDelete,
  onInfo,
}: {
  asset: LibraryAsset
  inUse: boolean
  selected: boolean
  /** Tile seçiliyse seçim boyutu, değilse 0 — menü bulk moduna bununla girer. */
  selectionCount: number
  /** Seçili asset'lerin drag payload'ı (görünür sırayla). */
  multiDragItems: LibraryDragItem[]
  folders: string[]
  /** Arama sonuçlarında hangi klasörde olduğunu göster. */
  showFolder: boolean
  /** Click ile seçim — modifier'lar (Cmd/Ctrl/Shift) event'ten okunur. */
  onSelectClick(e: React.MouseEvent): void
  onMove(folder: string): void
  onRename(): void
  onDelete(): void
  /** Action bar'daki bulk yolları — tek confirm + toplu döngü + özet toast. */
  onBulkMove(folder: string): void
  onBulkDelete(): void
  onInfo(): void
}) {
  // Sağ-tıklanan öğe SEÇİLİYSE menü aksiyonları tüm seçime uygulanır
  // (dosya yöneticisi standardı); değilse yalnız bu öğe.
  const bulkMode = selected && selectionCount > 1

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = "copy"
      const base: LibraryDragItem = {
        mediaId: asset.mediaId,
        label: asset.originalName,
        bpm: asset.bpm,
        key: asset.key,
        duration: asset.duration,
      }
      // Çoklu seçim sürükleniyorsa payload tüm seçimi taşır — sürüklenen
      // öğe items[0] olacak şekilde (deck consumer'ları top-level okur).
      const multi = selected && multiDragItems.length > 1
      const payload: LibraryDragPayload = multi
        ? {
            ...base,
            items: [
              base,
              ...multiDragItems.filter((i) => i.mediaId !== asset.mediaId),
            ],
          }
        : base
      e.dataTransfer.setData(LIBRARY_DRAG_MIME, JSON.stringify(payload))
      e.dataTransfer.setData("text/plain", asset.originalName)
      // Drag overlay — çoklu seçimde "N files" rozeti
      if (multi) {
        try {
          const badge = document.createElement("div")
          badge.textContent = `${payload.items!.length} files`
          badge.style.cssText =
            "position:fixed;top:-100px;left:-100px;padding:5px 10px;background:#171717;border:1px solid #525252;border-radius:8px;color:#fafafa;font-size:12px;font-weight:600;pointer-events:none;z-index:9999"
          document.body.appendChild(badge)
          e.dataTransfer.setDragImage(badge, 14, 14)
          // Tarayıcı drag image snapshot'ını aldıktan sonra temizle
          window.setTimeout(() => badge.remove(), 0)
        } catch {}
      }
    },
    [asset, selected, multiDragItems],
  )

  const newFolderPrompt = useCallback(async () => {
    const name = await promptInput({
      title: "New folder",
      label: "Folder name",
      placeholder: "e.g. drums/kicks",
      description: bulkMode
        ? `Use slashes for nesting. ${selectionCount} selected files will be moved into it.`
        : "Use slashes for nesting. The file will be moved into it.",
      confirmText: "Move",
    })
    const clean = name?.trim()
    if (!clean) return
    if (bulkMode) onBulkMove(clean)
    else onMove(clean)
  }, [onMove, onBulkMove, bulkMode, selectionCount])

  const moveTargets = folders.filter((f) => f !== asset.folder)
  const moveLabel = bulkMode
    ? `Move ${selectionCount} to folder`
    : "Move to folder"
  const deleteLabel = bulkMode ? `Delete ${selectionCount} files` : "Delete"
  const handleMoveTarget = (f: string) =>
    bulkMode ? onBulkMove(f) : onMove(f)
  const handleDeleteAction = () => (bulkMode ? onBulkDelete() : onDelete())

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            draggable
            data-tile="1"
            onDragStart={handleDragStart}
            onClick={(e) => {
              e.stopPropagation()
              onSelectClick(e)
            }}
            // Sağ-tık: seçili değilse önce bunu seç (dosya yöneticisi
            // standardı) + dış boş-alan menüsünü tetiklemesin
            onContextMenu={(e) => {
              e.stopPropagation()
              if (!selected) onSelectClick(e)
            }}
            className={cn(
              "group/tile relative flex cursor-grab flex-col items-center gap-1 rounded-lg border p-2 text-center transition hover:bg-neutral-800/40 active:cursor-grabbing",
              selected
                ? "border-pink-500/70 bg-pink-500/10 ring-1 ring-inset ring-pink-500/40"
                : inUse
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-transparent",
            )}
            title="Drag → deck waveform (load) or queue (enqueue) · right-click for actions"
          >
            {/* Dot menu — ⋯ hover'da; context menu ile aynı aksiyonlar */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    draggable={false}
                    title="Actions"
                    className="absolute right-1 top-1 rounded p-0.5 text-neutral-500 opacity-0 transition hover:bg-neutral-700 hover:text-neutral-100 group-hover/tile:opacity-100"
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} size={12} />
                  </button>
                }
              />
              <DropdownMenuContent className="w-48" align="end">
                <DropdownMenuItem onClick={onRename}>
                  <HugeiconsIcon icon={Edit02Icon} size={11} />
                  Rename…
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <HugeiconsIcon icon={FolderTransferIcon} size={11} />
                    {moveLabel}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 w-48 overflow-y-auto">
                    <DropdownMenuGroup>
                      {moveTargets.map((f) => (
                        <DropdownMenuItem
                          key={f}
                          onClick={() => handleMoveTarget(f)}
                        >
                          <HugeiconsIcon
                            icon={Folder02Icon}
                            size={11}
                            className="text-neutral-400"
                          />
                          <span className="truncate">{f}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => void newFolderPrompt()}>
                        <HugeiconsIcon icon={Add01Icon} size={11} />
                        New folder…
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={onInfo}>
                  <HugeiconsIcon icon={InformationCircleIcon} size={11} />
                  Get info
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDeleteAction}
                  className="text-red-400 data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-300"
                >
                  <HugeiconsIcon icon={Delete01Icon} size={11} />
                  {deleteLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <HugeiconsIcon
              icon={AudioWaveIcon}
              size={26}
              className={cn(
                "mt-1",
                selected
                  ? "text-pink-300"
                  : inUse
                    ? "text-emerald-400"
                    : "text-neutral-400 group-hover/tile:text-neutral-200",
              )}
            />
            <span
              className={cn(
                "line-clamp-2 w-full text-[11px] leading-tight",
                selected
                  ? "text-pink-100"
                  : inUse
                    ? "text-emerald-200"
                    : "text-neutral-200",
              )}
            >
              {asset.originalName}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[9px] text-neutral-500">
              {asset.bpm && (
                <span className="flex items-center gap-0.5">
                  <HugeiconsIcon icon={PulseIcon} size={8} />
                  {Math.round(asset.bpm)}
                </span>
              )}
              {asset.duration && <span>{fmtTime(asset.duration)}</span>}
              {asset.key && <span className="font-mono">{asset.key}</span>}
              {showFolder && asset.folder && (
                <span className="flex items-center gap-0.5 rounded bg-neutral-800 px-1 text-neutral-400">
                  <HugeiconsIcon icon={Folder02Icon} size={8} />
                  {asset.folder}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1">
              {asset.local && (
                <span
                  className="rounded bg-amber-500/20 px-1 font-mono text-[8px] font-bold uppercase tracking-widest text-amber-300"
                  title="Stored on this device — syncs to cloud with the project"
                >
                  Local
                </span>
              )}
              {inUse && (
                <span className="rounded bg-emerald-500/20 px-1 font-mono text-[8px] font-bold uppercase tracking-widest text-emerald-300">
                  In use
                </span>
              )}
            </div>
          </div>
        }
      />
      {/* Sağ-tık context menu — dot menu ile aynı aksiyonlar. Öğe seçiliyse
          Delete/Move TÜM seçime uygulanır (bulk yollar: tek confirm + özet). */}
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onRename}>
          <HugeiconsIcon icon={Edit02Icon} size={11} />
          Rename…
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <HugeiconsIcon icon={FolderTransferIcon} size={11} />
            {moveLabel}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-64 w-48 overflow-y-auto">
            <ContextMenuGroup>
              {moveTargets.map((f) => (
                <ContextMenuItem key={f} onClick={() => handleMoveTarget(f)}>
                  <HugeiconsIcon
                    icon={Folder02Icon}
                    size={11}
                    className="text-neutral-400"
                  />
                  <span className="truncate">{f}</span>
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => void newFolderPrompt()}>
                <HugeiconsIcon icon={Add01Icon} size={11} />
                New folder…
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={onInfo}>
          <HugeiconsIcon icon={InformationCircleIcon} size={11} />
          Get info
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={handleDeleteAction}
          className="text-red-400 data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-300"
        >
          <HugeiconsIcon icon={Delete01Icon} size={11} />
          {deleteLabel}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}
