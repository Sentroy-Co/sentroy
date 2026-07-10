"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Delete02Icon,
  HeadphonesIcon,
  Clock01Icon,
  PulseIcon,
  CloudIcon,
  ComputerIcon,
} from "@hugeicons/core-free-icons"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { confirm as openConfirm } from "@workspace/console/stores/confirm"
import {
  listLocalProjects,
  deleteLocalProject,
  type LocalProjectRecord,
} from "@/lib/local-db"

interface StudioProject {
  id: string
  title: string
  mode: "dj" | "musician"
  description: string | null
  bpm: number
  duration: number
  coverMediaId: string | null
  lastEditedAt: string
  createdAt: string
  /** true → sunucu listesinde yok, yalnız bu cihazın IndexedDB kaydında. */
  localOnly?: boolean
}

export function StudioProjectsContent({
  companySlug,
  lang,
}: {
  companySlug: string
  lang: string
}) {
  const [projects, setProjects] = useState<StudioProject[]>([])
  const [loading, setLoading] = useState(true)
  // LOCAL-FIRST proje kayıtları (IndexedDB) — cloud rozeti + merge için.
  // cloudSync=false → içerik yalnız o cihazda ("local" ibaresi); sunucu
  // listesinde hiç olmayanlar karta merge edilir (localOnly).
  const [localRecs, setLocalRecs] = useState<Map<string, LocalProjectRecord>>(
    () => new Map(),
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newMode, setNewMode] = useState<"dj" | "musician">("dj")
  const [creating, setCreating] = useState(false)
  // Proje açılırken (editor ~3-4s yükleniyor) animasyon: seçili card büyüyüp
  // loader'a döner, diğerleri küçülüp solar.
  const [openingId, setOpeningId] = useState<string | null>(null)
  const router = useRouter()

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      // Lokal kayıtlar — sunucu listesi başarısız olsa da rozetler/merge
      // çalışsın diye paralel + hataya dayanıklı.
      const localPromise = listLocalProjects(companySlug).catch(
        () => [] as LocalProjectRecord[],
      )
      const res = await fetch(
        `/api/companies/${companySlug}/studio/projects`,
        { credentials: "include" },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setProjects(json.data ?? [])
      const recs = await localPromise
      setLocalRecs(new Map(recs.map((r) => [r.projectId, r])))
    } catch (e) {
      toast.error("Failed to load projects")
      console.error(e)
      // Sunucu listesi düşse bile lokal kayıtları göster
      try {
        const recs = await listLocalProjects(companySlug)
        setLocalRecs(new Map(recs.map((r) => [r.projectId, r])))
      } catch {}
    } finally {
      setLoading(false)
    }
  }, [companySlug])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Sunucu listesi + IndexedDB merge — sunucuda olmayan lokal kayıtlar
  // (örn. sunucudan silinmiş ama içeriği bu cihazda duran projeler) da
  // kartlaşır; "local" ibaresiyle ayrışır.
  const mergedProjects = (() => {
    const serverIds = new Set(projects.map((p) => p.id))
    const localOnly: StudioProject[] = []
    for (const rec of localRecs.values()) {
      if (serverIds.has(rec.projectId)) continue
      localOnly.push({
        id: rec.projectId,
        title: rec.title,
        mode: rec.mode,
        description: null,
        bpm: rec.bpm || 120,
        duration: 0,
        coverMediaId: null,
        lastEditedAt: new Date(rec.updatedAt).toISOString(),
        createdAt: new Date(rec.updatedAt).toISOString(),
        localOnly: true,
      })
    }
    return [...projects, ...localOnly]
  })()

  const create = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch(
        `/api/companies/${companySlug}/studio/projects`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle.trim(), mode: newMode }),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? `HTTP ${res.status}`)
      }
      const json = await res.json()
      const project = json.data as StudioProject
      setCreateOpen(false)
      setNewTitle("")
      router.push(`/${lang}/p/${project.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed")
    } finally {
      setCreating(false)
    }
  }

  const remove = async (p: StudioProject) => {
    const ok = await openConfirm({
      title: `Delete "${p.title}"?`,
      description: p.localOnly
        ? "This project exists only on this device. Its local copy will be removed permanently."
        : "This project and its recordings reference will be removed. Audio assets in your storage bucket are kept.",
      confirmText: "Delete",
      destructive: true,
    })
    if (!ok) return
    // Yalnız-lokal kayıt — sunucu çağrısı yok, IndexedDB kaydı silinir
    if (p.localOnly) {
      try {
        await deleteLocalProject(p.id)
        toast.success("Local project removed")
        void refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed")
      }
      return
    }
    try {
      const res = await fetch(
        `/api/companies/${companySlug}/studio/projects/${p.id}`,
        { method: "DELETE", credentials: "include" },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Lokal snapshot'ı da temizle — yoksa merge kart olarak geri gelir
      try {
        await deleteLocalProject(p.id)
      } catch {}
      toast.success("Project deleted")
      void refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    }
  }

  const fmtDuration = (s: number) => {
    if (s === 0) return "—"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }
  const fmtRelative = (iso: string) => {
    const d = Date.now() - new Date(iso).getTime()
    const m = Math.floor(d / 60000)
    if (m < 1) return "just now"
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const day = Math.floor(h / 24)
    return `${day}d ago`
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Studio
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Projects for DJ sets. Upload your tracks, load them on the
            decks, mix, and record your live set.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <HugeiconsIcon icon={Add01Icon} size={16} />
            New project
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>
                Pick a mode: <strong>DJ</strong> for live sets / decks +
                crossfader; <strong>Musician</strong> for FL Studio
                style multitrack timeline with cut/paste/render.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewMode("dj")}
                    className={
                      "flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-xs transition " +
                      (newMode === "dj"
                        ? "border-pink-500 bg-pink-500/10"
                        : "border-border bg-card hover:border-foreground/30")
                    }
                  >
                    <span className="text-sm font-semibold">DJ</span>
                    <span className="text-muted-foreground">
                      4-deck Pioneer-style: jog wheels, sync, crossfader,
                      auto-mix, record set.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMode("musician")}
                    className={
                      "flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-xs transition " +
                      (newMode === "musician"
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-border bg-card hover:border-foreground/30")
                    }
                  >
                    <span className="text-sm font-semibold">Musician</span>
                    <span className="text-muted-foreground">
                      Multitrack timeline (FL Studio style): cut, move,
                      split clips; mic record; render to WAV.
                    </span>
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Project title</Label>
                <Input
                  id="title"
                  placeholder={newMode === "dj" ? "My Friday Set" : "New beat"}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void create()
                  }}
                  autoFocus
                  maxLength={100}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={create} disabled={!newTitle.trim() || creating}>
                {creating ? "Creating…" : "Create + open"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse opacity-50" />
          ))}
        </div>
      ) : mergedProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/40 px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <HugeiconsIcon
              icon={HeadphonesIcon}
              size={28}
              className="text-muted-foreground"
            />
          </div>
          <h3 className="mb-2 text-lg font-medium">No projects yet</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
            Create your first DJ project — upload tracks, load them on the
            decks, record your live set.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} size={16} />
            Create first project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mergedProjects.map((p) => (
            <motion.div
              key={p.id}
              animate={
                openingId === null
                  ? { scale: 1, opacity: 1, filter: "blur(0px)" }
                  : openingId === p.id
                    ? { scale: 1.04, opacity: 1, filter: "blur(0px)" }
                    : { scale: 0.82, opacity: 0, filter: "blur(4px)" }
              }
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              whileHover={openingId ? undefined : { y: -4 }}
              className="relative"
            >
            <Card className="group relative overflow-hidden rounded-2xl border-white/10 bg-card/50 shadow-lg backdrop-blur-xl transition-shadow duration-300 hover:shadow-2xl">
              {/* Per-mode ambient glow — OS derinliği */}
              <div
                aria-hidden
                className={
                  "pointer-events-none absolute -top-12 left-1/2 h-32 w-3/4 -translate-x-1/2 rounded-full opacity-40 blur-3xl transition-opacity duration-300 group-hover:opacity-75 " +
                  (p.mode === "dj" ? "bg-pink-500/40" : "bg-cyan-500/40")
                }
              />
              <Link
                href={`/${lang}/p/${p.id}`}
                onClick={() => setOpeningId(p.id)}
                className={
                  "absolute inset-0 z-10" +
                  (openingId ? " pointer-events-none" : "")
                }
                aria-label={`Open ${p.title}`}
              />
              <CardHeader className="relative flex flex-row items-start justify-between gap-2 pb-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge
                      className={
                        "px-1.5 py-0 text-[9px] uppercase tracking-wider " +
                        (p.mode === "dj"
                          ? "bg-pink-500/20 text-pink-300"
                          : "bg-cyan-500/20 text-cyan-300")
                      }
                    >
                      {p.mode}
                    </Badge>
                    {/* Sync durumu: içerik cloud'da mı, yalnız bu cihazda mı?
                        Lokal kaydı olmayan (bu cihazda hiç açılmamış) sunucu
                        projeleri cloud sayılır. */}
                    {p.localOnly ||
                    (localRecs.get(p.id) &&
                      !localRecs.get(p.id)!.cloudSync) ? (
                      <Badge
                        className="gap-1 bg-amber-500/20 px-1.5 py-0 text-[9px] uppercase tracking-wider text-amber-300"
                        title="Stored on this device — enable Cloud sync in the editor to upload"
                      >
                        <HugeiconsIcon icon={ComputerIcon} size={9} />
                        local
                      </Badge>
                    ) : (
                      <span
                        className="flex items-center text-sky-400/80"
                        title="Synced to cloud"
                      >
                        <HugeiconsIcon icon={CloudIcon} size={12} />
                      </span>
                    )}
                  </div>
                  <h3 className="truncate text-base font-medium">{p.title}</h3>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <HugeiconsIcon icon={PulseIcon} size={12} />
                    {p.bpm} BPM
                  </span>
                  <span className="flex items-center gap-1">
                    <HugeiconsIcon icon={Clock01Icon} size={12} />
                    {fmtDuration(p.duration)}
                  </span>
                </div>
              </CardContent>
              <CardFooter className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>{fmtRelative(p.lastEditedAt)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative z-20 h-7 px-2 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void remove(p)
                  }}
                  aria-label="Delete project"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} />
                </Button>
              </CardFooter>

              {/* Açılış loader — seçili card büyürken üstüne biner (3-4s nav) */}
              {openingId === p.id && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-card/70 backdrop-blur-sm">
                  <span
                    className={
                      "size-8 animate-spin rounded-full border-2 " +
                      (p.mode === "dj"
                        ? "border-pink-400/30 border-t-pink-400"
                        : "border-cyan-400/30 border-t-cyan-400")
                    }
                  />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Opening…
                  </span>
                </div>
              )}
            </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
