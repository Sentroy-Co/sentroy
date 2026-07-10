"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import * as THREE from "three"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlayIcon,
  PauseIcon,
  Loading03Icon,
  Delete02Icon,
  ArrowLeft01Icon,
  CircleIcon,
  Download01Icon,
  ImageAdd02Icon,
  TextFontIcon,
  TextBoldIcon,
  TextItalicIcon,
  Cancel01Icon,
  Folder01Icon,
  PencilEdit01Icon,
  PlusSignIcon,
  FileExportIcon,
} from "@hugeicons/core-free-icons"
import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { confirm } from "@workspace/console/stores/confirm"
import {
  PRESETS,
  PRESETS_BY_ID,
  DEFAULT_PRESET_ID,
  defaultParams,
  OVERLAY_FONTS,
  OVERLAY_WEIGHTS,
  type Preset,
  type PresetInstance,
  type PresetParam,
  type ParamValue,
} from "./threejs-presets"

// ── Types ─────────────────────────────────────────────────────────────────

interface Overlay {
  id: string
  type: "logo" | "text"
  content: string
  x: number
  y: number
  size: number
  color: string
  opacity: number
  // Text-only typography:
  fontFamily?: string
  fontWeight?: string
  fontStyle?: "normal" | "italic"
  letterSpacing?: number
  textAlign?: "left" | "center" | "right"
  uppercase?: boolean
  textShadow?: boolean
}

interface RecordSettings {
  width: number
  height: number
  fps: number
  durationSeconds: number
  background: string
}

interface SceneConfig {
  presetId: string
  params: Record<string, ParamValue>
  overlays: Overlay[]
  record: RecordSettings
}

function defaultConfig(presetId: string = DEFAULT_PRESET_ID): SceneConfig {
  const preset = PRESETS_BY_ID[presetId] ?? PRESETS[0]
  return {
    presetId: preset.id,
    params: defaultParams(preset),
    overlays: [],
    record: {
      width: 1280,
      height: 720,
      fps: 30,
      durationSeconds: 5,
      background: preset.background,
    },
  }
}

function genId(): string {
  return `o-${Math.random().toString(36).slice(2, 10)}`
}

function defaultTextOverlay(): Overlay {
  return {
    id: genId(),
    type: "text",
    content: "Sentroy",
    x: 50,
    y: 88,
    size: 36,
    color: "#ffffff",
    opacity: 1,
    fontFamily: OVERLAY_FONTS[0].value,
    fontWeight: "600",
    fontStyle: "normal",
    letterSpacing: 0,
    textAlign: "center",
    uppercase: false,
    textShadow: true,
  }
}

function defaultLogoOverlay(): Overlay {
  return {
    id: genId(),
    type: "logo",
    content: "https://sentroy.com/business/sentroy-logo-light.png",
    x: 90,
    y: 10,
    size: 48,
    color: "#ffffff",
    opacity: 1,
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export function ThreejsEditor({ sceneId }: { sceneId: string | null }) {
  const t = useTranslations("experimental")
  const router = useRouter()
  const params = useParams<{ lang: string }>()

  const [name, setName] = useState("Untitled scene")
  const [config, setConfig] = useState<SceneConfig>(defaultConfig())
  const [loading, setLoading] = useState(!!sceneId)
  const [saving, setSaving] = useState(false)
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  // Preset picker görünür mü? Eğer config henüz preset seçimine
  // ihtiyacı varsa (legacy kayıt veya kullanıcı değiştir derse) açılır.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(
    null,
  )

  // ── Three.js refs ────────────────────────────────────────────────────────
  const canvasContainerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const presetInstanceRef = useRef<PresetInstance | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const playingRef = useRef(false)
  const configRef = useRef(config)
  configRef.current = config

  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  // ── Load existing scene ──────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneId) return
    let cancelled = false
    fetch(`/api/admin/experimental/threejs-videos/${sceneId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.data) return
        setName(j.data.name)
        const c = (j.data.config ?? {}) as Partial<SceneConfig> & {
          objects?: unknown[]
        }
        // Legacy detection — eski "objects" tabanlı kayıtlar için preset
        // seçilmemiş gibi davran ve picker'ı aç.
        const isLegacy = !c.presetId && Array.isArray(c.objects)
        const presetId = c.presetId ?? DEFAULT_PRESET_ID
        const preset = PRESETS_BY_ID[presetId] ?? PRESETS[0]
        const merged: SceneConfig = {
          presetId: preset.id,
          params: { ...defaultParams(preset), ...(c.params ?? {}) },
          overlays: (c.overlays as Overlay[] | undefined) ?? [],
          record: {
            width: 1280,
            height: 720,
            fps: 30,
            durationSeconds: 5,
            background: preset.background,
            ...(c.record ?? {}),
          },
        }
        setConfig(merged)
        if (isLegacy) {
          toast.info(t("legacyScene"))
          setPickerOpen(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sceneId, t])

  // ── Three.js init ────────────────────────────────────────────────────────
  useEffect(() => {
    const container = canvasContainerRef.current
    if (!container) return

    const c = configRef.current
    const preset = PRESETS_BY_ID[c.presetId] ?? PRESETS[0]
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(c.record.width, c.record.height, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    container.appendChild(renderer.domElement)
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "auto"
    renderer.domElement.style.display = "block"
    renderer.domElement.style.borderRadius = "8px"

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(c.record.background)

    const camera = new THREE.PerspectiveCamera(
      preset.camera.fov ?? 50,
      c.record.width / c.record.height,
      0.1,
      1000,
    )
    camera.position.set(...preset.camera.position)
    camera.lookAt(...preset.camera.lookAt)

    rendererRef.current = renderer
    sceneRef.current = scene
    cameraRef.current = camera

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (presetInstanceRef.current) {
        presetInstanceRef.current.dispose()
        presetInstanceRef.current = null
      }
      renderer.dispose()
      try {
        container.removeChild(renderer.domElement)
      } catch {
        /* zaten kaldırıldıysa yoksay */
      }
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const renderOnce = useCallback(() => {
    const r = rendererRef.current
    const s = sceneRef.current
    const c = cameraRef.current
    if (!r || !s || !c) return
    // Preset kendi pipeline'ını (örn. EffectComposer) yönetiyorsa
    // standart render yerine onu çağır. Default davranış aynı kalır.
    const inst = presetInstanceRef.current
    if (inst?.render) inst.render()
    else r.render(s, c)
  }, [])

  // Preset değişince rebuild — eski instance dispose, yeni preset.build çağır.
  useEffect(() => {
    let cancelled = false
    const scene = sceneRef.current
    const camera = cameraRef.current
    const renderer = rendererRef.current
    if (!scene || !camera || !renderer) return

    if (presetInstanceRef.current) {
      presetInstanceRef.current.dispose()
      presetInstanceRef.current = null
    }

    const preset = PRESETS_BY_ID[config.presetId] ?? PRESETS[0]
    // Camera'yı preset'e göre yeniden ayarla — preset değişimi kamera
    // konumunu da değiştirir, yoksa wireframe head 200 birim uzağa kurulu
    // olduğu için sonraki cube preset boş canvas gibi görünür.
    camera.fov = preset.camera.fov ?? 50
    camera.position.set(...preset.camera.position)
    camera.lookAt(...preset.camera.lookAt)
    camera.updateProjectionMatrix()

    Promise.resolve(
      preset.build(
        { THREE, scene, camera, renderer, requestRender: renderOnce },
        config.params,
      ),
    )
      .then((instance) => {
        if (cancelled) {
          instance.dispose()
          return
        }
        presetInstanceRef.current = instance
        renderOnce()
      })
      .catch((err) => {
        toast.error(`Preset build failed: ${(err as Error).message}`)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.presetId])

  // Param değişince apply — preset apply true dönerse tek render, yoksa
  // rebuild gerekir (şu an apply her zaman var, ama future-proof tutuyoruz).
  useEffect(() => {
    const inst = presetInstanceRef.current
    if (!inst) return
    if (inst.apply) {
      inst.apply(config.params)
      renderOnce()
    }
  }, [config.params, renderOnce])

  // Record settings değişince renderer + camera resize.
  useEffect(() => {
    const r = rendererRef.current
    const c = cameraRef.current
    const s = sceneRef.current
    if (!r || !c || !s) return
    r.setSize(config.record.width, config.record.height, false)
    c.aspect = config.record.width / config.record.height
    c.updateProjectionMatrix()
    s.background = new THREE.Color(config.record.background)
    // Preset postprocessing pipeline kullanıyorsa composer da resize.
    presetInstanceRef.current?.resize?.(
      config.record.width,
      config.record.height,
    )
    renderOnce()
  }, [
    config.record.width,
    config.record.height,
    config.record.background,
    renderOnce,
  ])

  // ── Animation tick ──────────────────────────────────────────────────────
  const tick = useCallback(
    (time: number) => {
      if (!playingRef.current) return
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0
      lastTimeRef.current = time
      presetInstanceRef.current?.update?.(dt)
      renderOnce()
      rafRef.current = requestAnimationFrame(tick)
    },
    [renderOnce],
  )

  const startPlay = useCallback(() => {
    if (playingRef.current) return
    playingRef.current = true
    setPlaying(true)
    lastTimeRef.current = 0
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  const stopPlay = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  // ── Recording ────────────────────────────────────────────────────────────
  async function startRecord() {
    const r = rendererRef.current
    if (!r || recording) return
    if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    setRecordedUrl(null)
    recordedChunksRef.current = []
    const stream = (r.domElement as HTMLCanvasElement).captureStream(
      config.record.fps,
    )
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm"
    const recorder = new MediaRecorder(stream, { mimeType: mime })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mime })
      const url = URL.createObjectURL(blob)
      setRecordedUrl(url)
      stopPlay()
      setRecording(false)
      toast.success(t("recordingDone"))
    }
    recorderRef.current = recorder
    setRecording(true)
    startPlay()
    recorder.start()
    setTimeout(() => {
      try {
        recorder.stop()
      } catch {
        /* already stopped */
      }
    }, config.record.durationSeconds * 1000)
  }

  function downloadRecording() {
    if (!recordedUrl) return
    const a = document.createElement("a")
    a.href = recordedUrl
    a.download = `${name.replace(/\s+/g, "-")}-${Date.now()}.webm`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true)
    try {
      const url = sceneId
        ? `/api/admin/experimental/threejs-videos/${sceneId}`
        : "/api/admin/experimental/threejs-videos"
      const method = sceneId ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, config }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("saved"))
      if (!sceneId && json.data?.id) {
        router.replace(
          `/${params.lang}/admin/experimental/threejs-videos/${json.data.id}`,
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  // ── Mutations ────────────────────────────────────────────────────────────
  const preset = useMemo(
    () => PRESETS_BY_ID[config.presetId] ?? PRESETS[0],
    [config.presetId],
  )

  function selectPreset(p: Preset) {
    setConfig((c) => ({
      ...c,
      presetId: p.id,
      params: defaultParams(p),
      record: { ...c.record, background: p.background },
    }))
    setPickerOpen(false)
  }

  function setParam(key: string, value: ParamValue) {
    setConfig((c) => ({ ...c, params: { ...c.params, [key]: value } }))
  }

  function updateOverlay(id: string, patch: Partial<Overlay>) {
    setConfig((c) => ({
      ...c,
      overlays: c.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }))
  }

  function removeOverlay(id: string) {
    setConfig((c) => ({
      ...c,
      overlays: c.overlays.filter((o) => o.id !== id),
    }))
    if (selectedOverlayId === id) setSelectedOverlayId(null)
  }

  function addOverlay(type: "text" | "logo") {
    const ov = type === "text" ? defaultTextOverlay() : defaultLogoOverlay()
    setConfig((c) => ({ ...c, overlays: [...c.overlays, ov] }))
    setSelectedOverlayId(ov.id)
  }

  const selectedOverlay = useMemo(
    () => config.overlays.find((o) => o.id === selectedOverlayId) ?? null,
    [config.overlays, selectedOverlayId],
  )

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
        <HugeiconsIcon
          icon={Loading03Icon}
          strokeWidth={2}
          className="mr-2 size-4 animate-spin"
        />
        Loading scene…
      </div>
    )
  }

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-3 md:p-4">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              router.push(`/${params.lang}/admin/experimental/threejs-videos`)
            }
            title="Back"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-64 text-sm"
          />
          <div className="flex items-center gap-1">
            {playing ? (
              <Button variant="outline" size="sm" onClick={stopPlay}>
                <HugeiconsIcon
                  icon={PauseIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("pause")}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={startPlay}>
                <HugeiconsIcon
                  icon={PlayIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("play")}
              </Button>
            )}
            <Button
              variant={recording ? "destructive" : "outline"}
              size="sm"
              onClick={startRecord}
              disabled={recording}
            >
              <HugeiconsIcon
                icon={recording ? Loading03Icon : CircleIcon}
                strokeWidth={2}
                className={recording ? "animate-spin" : ""}
                data-icon="inline-start"
              />
              {recording
                ? t("recording")
                : t("recordSeconds", {
                    sec: config.record.durationSeconds,
                  })}
            </Button>
            {recordedUrl && (
              <Button variant="outline" size="sm" onClick={downloadRecording}>
                <HugeiconsIcon
                  icon={Download01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("download")}
              </Button>
            )}
          </div>
          <div className="ms-auto flex items-center gap-2">
            <ScenesSheet currentSceneId={sceneId} t={t} />
            <Button onClick={save} disabled={saving}>
              {saving && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("save")}
            </Button>
          </div>
        </div>

        {/* Editor: canvas + sidebar */}
        <div className="flex flex-1 min-h-0 gap-3">
          {/* Canvas */}
          <div className="relative flex-1 min-w-0 overflow-auto rounded-xl border bg-muted/20 p-4">
            <div
              className="relative mx-auto"
              style={{
                maxWidth: `${config.record.width}px`,
                aspectRatio: `${config.record.width} / ${config.record.height}`,
              }}
            >
              <div ref={canvasContainerRef} className="size-full" />
              {/* Overlays */}
              {config.overlays.map((ov) => (
                <button
                  key={ov.id}
                  type="button"
                  onClick={() => setSelectedOverlayId(ov.id)}
                  className={
                    "absolute outline-offset-2 transition-shadow " +
                    (selectedOverlayId === ov.id
                      ? "outline outline-2 outline-primary"
                      : "outline-none hover:outline hover:outline-1 hover:outline-primary/40")
                  }
                  style={{
                    left: `${ov.x}%`,
                    top: `${ov.y}%`,
                    transform: "translate(-50%, -50%)",
                    opacity: ov.opacity,
                  }}
                >
                  {ov.type === "logo" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={ov.content}
                      alt=""
                      style={{ height: ov.size, width: "auto" }}
                      draggable={false}
                    />
                  ) : (
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: ov.size,
                        color: ov.color,
                        fontFamily: ov.fontFamily,
                        fontWeight: ov.fontWeight,
                        fontStyle: ov.fontStyle,
                        letterSpacing: `${ov.letterSpacing ?? 0}px`,
                        textAlign: ov.textAlign ?? "center",
                        textTransform: ov.uppercase ? "uppercase" : "none",
                        textShadow: ov.textShadow
                          ? "0 2px 8px rgba(0,0,0,0.4)"
                          : "none",
                        whiteSpace: "pre",
                      }}
                    >
                      {ov.content}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              {config.record.width} × {config.record.height} ·{" "}
              {config.record.fps} fps
            </p>
          </div>

          {/* Right panel */}
          <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto">
            {/* Active preset card */}
            <Section title={t("preset")}>
              <div className="flex items-start gap-2 rounded-lg border bg-card p-2">
                <div
                  className="grid size-10 shrink-0 place-items-center rounded-md border bg-muted/30 font-mono text-[10px] font-semibold uppercase text-muted-foreground"
                  aria-hidden
                >
                  {preset.badge}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">
                    {preset.name}
                  </div>
                  <div className="line-clamp-2 text-[10px] text-muted-foreground">
                    {preset.description}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setPickerOpen(true)}
              >
                {t("changePreset")}
              </Button>
            </Section>

            {/* Preset params */}
            {preset.params.length > 0 && (
              <Section title={t("presetControls")}>
                {preset.params.map((p) => (
                  <ParamControl
                    key={p.key}
                    param={p}
                    value={config.params[p.key] ?? p.default}
                    onChange={(v) => setParam(p.key, v)}
                  />
                ))}
              </Section>
            )}

            {/* Recording */}
            <Section title={t("recordSettings")}>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("widthLabel")}>
                  <Input
                    type="number"
                    value={config.record.width}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        record: {
                          ...c.record,
                          width: Math.max(160, parseInt(e.target.value) || 0),
                        },
                      }))
                    }
                  />
                </Field>
                <Field label={t("heightLabel")}>
                  <Input
                    type="number"
                    value={config.record.height}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        record: {
                          ...c.record,
                          height: Math.max(120, parseInt(e.target.value) || 0),
                        },
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="FPS">
                  <Select
                    value={String(config.record.fps)}
                    onValueChange={(v) => {
                      if (!v) return
                      setConfig((c) => ({
                        ...c,
                        record: { ...c.record, fps: parseInt(v) },
                      }))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue>{config.record.fps}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {[24, 30, 60].map((f) => (
                        <SelectItem key={f} value={String(f)}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("durationLabel")}>
                  <Input
                    type="number"
                    value={config.record.durationSeconds}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        record: {
                          ...c.record,
                          durationSeconds: Math.max(
                            1,
                            parseInt(e.target.value) || 1,
                          ),
                        },
                      }))
                    }
                  />
                </Field>
              </div>
              <Field label={t("backgroundLabel")}>
                <Input
                  type="color"
                  value={config.record.background}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      record: { ...c.record, background: e.target.value },
                    }))
                  }
                  className="h-9 cursor-pointer"
                />
              </Field>
            </Section>

            {/* Overlays */}
            <Section title={t("overlays")}>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-[11px]"
                  onClick={() => addOverlay("text")}
                >
                  <HugeiconsIcon
                    icon={TextFontIcon}
                    strokeWidth={2}
                    className="size-3"
                    data-icon="inline-start"
                  />
                  {t("addText")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-[11px]"
                  onClick={() => addOverlay("logo")}
                >
                  <HugeiconsIcon
                    icon={ImageAdd02Icon}
                    strokeWidth={2}
                    className="size-3"
                    data-icon="inline-start"
                  />
                  {t("addLogo")}
                </Button>
              </div>
              {config.overlays.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {t("noOverlays")}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {config.overlays.map((ov) => (
                  <button
                    key={ov.id}
                    type="button"
                    onClick={() => setSelectedOverlayId(ov.id)}
                    className={
                      "flex items-center gap-2 rounded-md border px-2 py-1.5 text-start text-xs transition-colors " +
                      (selectedOverlayId === ov.id
                        ? "border-foreground/40 bg-muted"
                        : "border-border hover:bg-muted/50")
                    }
                  >
                    <HugeiconsIcon
                      icon={ov.type === "text" ? TextFontIcon : ImageAdd02Icon}
                      strokeWidth={2}
                      className="size-3 shrink-0 text-muted-foreground"
                    />
                    <span className="flex-1 truncate">{ov.content}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeOverlay(ov.id)
                      }}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <HugeiconsIcon
                        icon={Delete02Icon}
                        strokeWidth={2}
                        className="size-3"
                      />
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            {/* Selected overlay editor */}
            {selectedOverlay && (
              <OverlayEditor
                overlay={selectedOverlay}
                onChange={(patch) => updateOverlay(selectedOverlay.id, patch)}
                onClose={() => setSelectedOverlayId(null)}
                t={t}
              />
            )}
          </div>
        </div>
      </div>

      {/* Preset picker modal — kullanıcı yeni sahne açtığında otomatik
          gözükmez (default preset zaten yüklü) ama "Change preset" ile
          açılır. Legacy kayıtlarda otomatik açılır. */}
      {pickerOpen && (
        <PresetPicker
          currentId={config.presetId}
          onSelect={selectPreset}
          onClose={() => setPickerOpen(false)}
          t={t}
        />
      )}
    </PageTransition>
  )
}

// ── Preset picker modal ──────────────────────────────────────────────────

function PresetPicker({
  currentId,
  onSelect,
  onClose,
  t,
}: {
  currentId: string
  onSelect: (p: Preset) => void
  onClose: () => void
  t: (k: string) => string
}) {
  // Kategori bazlı gruplama — gelecekte 10+ preset için filter friendly.
  const grouped = useMemo(() => {
    const map = new Map<string, Preset[]>()
    for (const p of PRESETS) {
      const list = map.get(p.category) ?? []
      list.push(p)
      map.set(p.category, list)
    }
    return Array.from(map.entries())
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 rounded-xl border bg-background p-4 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">{t("pickPreset")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("pickPresetDesc")}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto">
          {grouped.map(([category, items]) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelect(p)}
                    className={
                      "flex items-start gap-3 rounded-lg border p-3 text-start transition-all hover:border-foreground/40 hover:bg-muted/40 " +
                      (currentId === p.id
                        ? "border-foreground/60 bg-muted/50 ring-2 ring-foreground/20"
                        : "border-border")
                    }
                  >
                    <div
                      className="grid size-12 shrink-0 place-items-center rounded-md border font-mono text-xs font-semibold uppercase text-muted-foreground"
                      style={{ background: p.background }}
                    >
                      <span
                        style={{
                          color:
                            parseInt(p.background.slice(1, 3), 16) > 128
                              ? "#000"
                              : "#fff",
                        }}
                      >
                        {p.badge}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {p.description}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground/80">
                        {p.params.length} {t("controls")}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Param control switcher ───────────────────────────────────────────────

function ParamControl({
  param,
  value,
  onChange,
}: {
  param: PresetParam
  value: ParamValue
  onChange: (v: ParamValue) => void
}) {
  switch (param.type) {
    case "color":
      return (
        <Field label={param.label}>
          <Input
            type="color"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 cursor-pointer"
          />
        </Field>
      )
    case "number":
      return (
        <Field label={`${param.label} (${value})`}>
          <input
            type="range"
            min={param.min}
            max={param.max}
            step={param.step}
            value={Number(value)}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full"
          />
        </Field>
      )
    case "boolean":
      return (
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{param.label}</span>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
        </label>
      )
    case "select":
      return (
        <Field label={param.label}>
          <Select
            value={String(value)}
            onValueChange={(v) => {
              if (v) onChange(v)
            }}
          >
            <SelectTrigger>
              <SelectValue>
                {param.options.find((o) => o.value === value)?.label ?? value}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {param.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )
  }
}

// ── Overlay editor (text + logo) ─────────────────────────────────────────

function OverlayEditor({
  overlay,
  onChange,
  onClose,
  t,
}: {
  overlay: Overlay
  onChange: (patch: Partial<Overlay>) => void
  onClose: () => void
  t: (k: string) => string
}) {
  const isText = overlay.type === "text"
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isText ? t("textOverlay") : t("logoOverlay")}
        </h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2}
            className="size-3"
          />
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Field label={isText ? t("text") : t("imageUrl")}>
          {isText ? (
            <textarea
              value={overlay.content}
              onChange={(e) => onChange({ content: e.target.value })}
              rows={2}
              className="rounded-md border bg-transparent px-2 py-1.5 text-xs"
            />
          ) : (
            <Input
              value={overlay.content}
              onChange={(e) => onChange({ content: e.target.value })}
              className="text-xs"
            />
          )}
        </Field>

        <div className="grid grid-cols-3 gap-2">
          <Field label="X %">
            <Input
              type="number"
              value={overlay.x}
              onChange={(e) =>
                onChange({ x: parseFloat(e.target.value) || 0 })
              }
            />
          </Field>
          <Field label="Y %">
            <Input
              type="number"
              value={overlay.y}
              onChange={(e) =>
                onChange({ y: parseFloat(e.target.value) || 0 })
              }
            />
          </Field>
          <Field label={t("size")}>
            <Input
              type="number"
              value={overlay.size}
              onChange={(e) =>
                onChange({ size: parseFloat(e.target.value) || 0 })
              }
            />
          </Field>
        </div>

        <Field label={t("opacity")}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={overlay.opacity}
            onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
            className="w-full"
          />
        </Field>

        {isText && (
          <>
            <Field label={t("fontFamily")}>
              <Select
                value={overlay.fontFamily ?? OVERLAY_FONTS[0].value}
                onValueChange={(v) => v && onChange({ fontFamily: v })}
              >
                <SelectTrigger>
                  <SelectValue>
                    {OVERLAY_FONTS.find((f) => f.value === overlay.fontFamily)
                      ?.label ?? "Custom"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {OVERLAY_FONTS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      <span style={{ fontFamily: f.value }}>{f.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label={t("fontWeight")}>
                <Select
                  value={overlay.fontWeight ?? "400"}
                  onValueChange={(v) => v && onChange({ fontWeight: v })}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {OVERLAY_WEIGHTS.find(
                        (w) => w.value === overlay.fontWeight,
                      )?.label ?? overlay.fontWeight}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {OVERLAY_WEIGHTS.map((w) => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("color")}>
                <Input
                  type="color"
                  value={overlay.color}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="h-9 cursor-pointer"
                />
              </Field>
            </div>

            <Field label={t("letterSpacing")}>
              <input
                type="range"
                min={-2}
                max={20}
                step={0.5}
                value={overlay.letterSpacing ?? 0}
                onChange={(e) =>
                  onChange({ letterSpacing: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </Field>

            <div className="flex items-center gap-1">
              <ToggleButton
                active={overlay.fontStyle === "italic"}
                onClick={() =>
                  onChange({
                    fontStyle:
                      overlay.fontStyle === "italic" ? "normal" : "italic",
                  })
                }
                title={t("italic")}
                icon={TextItalicIcon}
              />
              <ToggleButton
                active={overlay.uppercase ?? false}
                onClick={() => onChange({ uppercase: !overlay.uppercase })}
                title={t("uppercase")}
                icon={TextBoldIcon}
                label="AA"
              />
              <ToggleButton
                active={overlay.textShadow ?? false}
                onClick={() => onChange({ textShadow: !overlay.textShadow })}
                title={t("textShadow")}
                label="T"
              />
              <div className="ms-auto flex gap-0.5 rounded-md border p-0.5">
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => onChange({ textAlign: align })}
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] " +
                      ((overlay.textAlign ?? "center") === align
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50")
                    }
                  >
                    {align[0].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Scenes sheet (sağdan kayan kayıtlı sahne listesi) ───────────────────

interface SceneRow {
  id: string
  name: string
  description?: string | null
  updatedAt: string
  config?: unknown
}

function ScenesSheet({
  currentSceneId,
  t,
}: {
  currentSceneId: string | null
  t: (k: string, v?: Record<string, string | number>) => string
}) {
  const router = useRouter()
  const params = useParams<{ lang: string }>()
  const [open, setOpen] = useState(false)
  const [scenes, setScenes] = useState<SceneRow[]>([])
  const [loading, setLoading] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // Sheet ilk açıldığında veya yeniden açıldığında refresh — kullanıcı
  // yeni sahne save etmiş olabilir, listeyi sürekli stale tutmayalım.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetch("/api/admin/experimental/threejs-videos")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        setScenes((j.data as SceneRow[]) ?? [])
      })
      .catch(() => {
        if (!cancelled) setScenes([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const goToScene = useCallback(
    (id: string) => {
      router.push(`/${params.lang}/admin/experimental/threejs-videos/${id}`)
      setOpen(false)
    },
    [router, params.lang],
  )

  const newScene = useCallback(() => {
    router.push(`/${params.lang}/admin/experimental/threejs-videos/new`)
    setOpen(false)
  }, [router, params.lang])

  const remove = useCallback(
    async (scene: SceneRow) => {
      const ok = await confirm({
        title: t("deleteSceneTitle"),
        description: t("deleteSceneDesc", { name: scene.name }),
        confirmText: t("delete"),
        destructive: true,
      })
      if (!ok) return
      setActingId(scene.id)
      try {
        const res = await fetch(
          `/api/admin/experimental/threejs-videos/${scene.id}`,
          { method: "DELETE" },
        )
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || "Failed")
        }
        toast.success(t("deleted"))
        setScenes((list) => list.filter((s) => s.id !== scene.id))
        // Şu an açık sahneyi sildiyse listeye geri dön — editor stale
        // bir id'le çalışmaya devam ederse PATCH 404 verir.
        if (scene.id === currentSceneId) {
          router.push(`/${params.lang}/admin/experimental/threejs-videos`)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed")
      } finally {
        setActingId(null)
      }
    },
    [currentSceneId, router, params.lang, t],
  )

  // İndirme — sahne config'i JSON olarak download. Liste endpoint'i config'i
  // döndürmüyor olabilir, o yüzden /[id] endpoint'inden tek-tek fetch.
  const download = useCallback(
    async (scene: SceneRow) => {
      setDownloadingId(scene.id)
      try {
        let payload: { name: string; config: unknown }
        if (scene.config) {
          payload = { name: scene.name, config: scene.config }
        } else {
          const res = await fetch(
            `/api/admin/experimental/threejs-videos/${scene.id}`,
          )
          const j = await res.json()
          if (!res.ok) throw new Error(j.error || "Failed")
          payload = { name: j.data.name, config: j.data.config }
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${scene.name.replace(/\s+/g, "-").toLowerCase()}-${scene.id}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success(t("sceneDownloaded"))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed")
      } finally {
        setDownloadingId(null)
      }
    },
    [t],
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm">
            <HugeiconsIcon
              icon={Folder01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("savedScenes")}
          </Button>
        }
      />
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("savedScenes")}</SheetTitle>
          <SheetDescription>{t("savedScenesDesc")}</SheetDescription>
          <Button
            size="sm"
            variant="outline"
            onClick={newScene}
            className="w-fit"
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("newScene")}
          </Button>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : scenes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("emptyScenes")}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {scenes.map((s) => {
                const isCurrent = s.id === currentSceneId
                const isActing = actingId === s.id
                const isDownloading = downloadingId === s.id
                return (
                  <li
                    key={s.id}
                    className={
                      "group flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors " +
                      (isCurrent
                        ? "border-foreground/40 ring-1 ring-foreground/20"
                        : "border-border hover:border-foreground/20")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {s.name}
                          </span>
                          {isCurrent && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                              {t("currentScene")}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(s.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {s.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {s.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 text-[11px]"
                        onClick={() => goToScene(s.id)}
                        disabled={isCurrent}
                      >
                        <HugeiconsIcon
                          icon={PencilEdit01Icon}
                          strokeWidth={2}
                          className="size-3"
                          data-icon="inline-start"
                        />
                        {isCurrent ? t("currentScene") : t("open")}
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => download(s)}
                        disabled={isDownloading}
                        title={t("downloadScene")}
                      >
                        <HugeiconsIcon
                          icon={
                            isDownloading ? Loading03Icon : FileExportIcon
                          }
                          strokeWidth={2}
                          className={
                            "size-3.5 " +
                            (isDownloading ? "animate-spin" : "")
                          }
                        />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => remove(s)}
                        disabled={isActing}
                        className="text-muted-foreground hover:text-destructive"
                        title={t("delete")}
                      >
                        <HugeiconsIcon
                          icon={isActing ? Loading03Icon : Delete02Icon}
                          strokeWidth={2}
                          className={
                            "size-3.5 " + (isActing ? "animate-spin" : "")
                          }
                        />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Small UI helpers ──────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] uppercase text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  title,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  title: string
  icon?: typeof TextBoldIcon
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        "flex h-7 w-7 items-center justify-center rounded-md border text-[10px] font-bold transition-colors " +
        (active
          ? "border-foreground/40 bg-muted text-foreground"
          : "border-border text-muted-foreground hover:bg-muted/50")
      }
    >
      {icon ? (
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3" />
      ) : (
        label
      )}
    </button>
  )
}
