"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Delete01Icon,
  FloppyDiskIcon,
  Loading03Icon,
  ToggleOffIcon,
  ToggleOnIcon,
} from "@hugeicons/core-free-icons"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import type {
  MusicianEffect,
  MusicianTrack,
} from "@workspace/db/models/studio-project-data"
import { confirm } from "@workspace/console/stores/confirm"
import { ProKnob, ProSlider } from "../controls"

/**
 * FX chain content — InspectorPanel sekmesi içeriği. Sheet wrapper yok;
 * sol panelde chain liste + sağda seçili FX'in pro-knob matrisi + preset
 * load/save popover.
 */

type FxType = MusicianEffect["type"]

interface PresetDoc {
  id: string
  companyId: string
  userId: string
  name: string
  effectType: FxType
  wet: number
  params: Record<string, number | string | boolean>
  isShared: boolean
  createdAt: string
  updatedAt: string
}

const FX_LIBRARY: {
  type: FxType
  label: string
  description: string
  accent: string
  /** UI category — Add Effect dropdown'unda grup başlığı için. */
  category: "dynamics" | "eq-filter" | "time" | "modulation" | "distortion" | "spatial"
}[] = [
  // Time-based
  { type: "echo", label: "Echo", description: "Ping-pong stereo delay", accent: "#ec4899", category: "time" },
  { type: "reverb", label: "Reverb", description: "Freeverb room sim", accent: "#06b6d4", category: "time" },
  // Modulation
  { type: "chorus", label: "Chorus", description: "Detuned warm doubling", accent: "#8b5cf6", category: "modulation" },
  { type: "tremolo", label: "Tremolo", description: "Amplitude modulation", accent: "#d946ef", category: "modulation" },
  { type: "phaser", label: "Phaser", description: "All-pass swirl mod", accent: "#a855f7", category: "modulation" },
  { type: "autoWah", label: "Auto-Wah", description: "Envelope-following wah", accent: "#f59e0b", category: "modulation" },
  { type: "filterSweep", label: "Filter Sweep", description: "Auto-filter cyclic LFO", accent: "#14b8a6", category: "modulation" },
  // EQ / filter
  { type: "eq3", label: "EQ3", description: "3-band L/M/H eq", accent: "#22c55e", category: "eq-filter" },
  // Distortion
  { type: "distortion", label: "Distortion", description: "Hard overdrive curve", accent: "#ef4444", category: "distortion" },
  { type: "bitcrusher", label: "BitCrush", description: "Lo-fi sample reduction", accent: "#f97316", category: "distortion" },
  // Dynamics
  { type: "compressor", label: "Compressor", description: "Dynamic range comp", accent: "#eab308", category: "dynamics" },
  { type: "multibandCompressor", label: "Multi-Comp", description: "3-band L/M/H comp", accent: "#facc15", category: "dynamics" },
  { type: "limiter", label: "Limiter", description: "Peak ceiling limiter", accent: "#fb923c", category: "dynamics" },
  { type: "feedbackDelay", label: "Feedback Delay", description: "Mono dub delay (heavy fb)", accent: "#f472b6", category: "time" },
  { type: "hallReverb", label: "Hall Reverb", description: "Convolution-style cathedral", accent: "#0ea5e9", category: "time" },
  // Dynamics extras
  { type: "pumpingComp", label: "Pumping Comp", description: "Sidechain-style ghost duck", accent: "#fde047", category: "dynamics" },
  // Distortion / glitch extras
  { type: "stutterGate", label: "Stutter Gate", description: "Square-LFO amp slicer", accent: "#fb923c", category: "distortion" },
  // Vocal / pitch
  { type: "autoTune", label: "Auto-Tune Lite", description: "T-Pain chromatic snap", accent: "#f9a8d4", category: "modulation" },
  { type: "harmonizer", label: "Harmonizer", description: "3-voice parallel pitch (choir)", accent: "#e879f9", category: "modulation" },
  // Dynamics — gerçek sidechain (Pumping Comp ghost variant'tan farklı)
  { type: "sidechainComp", label: "Sidechain Comp", description: "Duck via source track envelope", accent: "#fbbf24", category: "dynamics" },
  // Time / atmosphere
  { type: "shimmerReverb", label: "Shimmer Reverb", description: "Pitch-fed cascading reverb", accent: "#38bdf8", category: "time" },
  // Modulation extras
  { type: "autoPanner", label: "AutoPanner", description: "LFO stereo pan", accent: "#a78bfa", category: "modulation" },
  { type: "vibrato", label: "Vibrato", description: "Pitch wobble LFO", accent: "#c084fc", category: "modulation" },
  // EQ / filter extras
  { type: "highpassFilter", label: "HPF", description: "Highpass cut", accent: "#10b981", category: "eq-filter" },
  { type: "lowpassFilter", label: "LPF", description: "Lowpass cut", accent: "#84cc16", category: "eq-filter" },
  { type: "bandpassFilter", label: "BPF", description: "Bandpass focus", accent: "#34d399", category: "eq-filter" },
  { type: "djFilter", label: "DJ Filter", description: "HPF+LPF single knob (CDJ)", accent: "#16a34a", category: "eq-filter" },
  // Pitch / freak
  { type: "pitchShift", label: "Pitch Shift", description: "Helium / god / demon voice", accent: "#fb7185", category: "modulation" },
  { type: "frequencyShifter", label: "Freq Shift", description: "Linear Hz shift (alien)", accent: "#e879f9", category: "modulation" },
  // Spatial
  { type: "stereoWidener", label: "Widener", description: "Stereo width control", accent: "#0891b2", category: "spatial" },
]

const FX_META = Object.fromEntries(
  FX_LIBRARY.map((f) => [f.type, f]),
) as Record<FxType, (typeof FX_LIBRARY)[number]>

/**
 * Preset bundle'lar — kullanıcı tek tıkla birden çok FX'i sırayla chain'e
 * ekler. AddEffectPopover dropdown'ında "Presets" alt-grubu olarak görünür.
 *
 * Lo-Fi Vinyl signature: BitCrush (8 bit) + Vibrato (4Hz wow) + LPF (6kHz
 * cut) — chillhop / boom-bap dokusu. Producer'lar bu üçlüyü sürekli yüklüyor.
 */
const PRESET_BUNDLES: {
  id: string
  name: string
  description: string
  accent: string
  fx: Array<{
    type: FxType
    wet: number
    params: Record<string, number | string | boolean>
  }>
}[] = [
  {
    id: "lofi-vinyl",
    name: "Lo-Fi Vinyl",
    description: "BitCrush + Vibrato + LPF (chillhop)",
    accent: "#fb923c",
    fx: [
      { type: "bitcrusher", wet: 0.55, params: { bits: 8 } },
      {
        type: "vibrato",
        wet: 0.35,
        params: { frequency: 4, depth: 0.05 },
      },
      {
        type: "lowpassFilter",
        wet: 1,
        params: { frequency: 6000, Q: 0.7, rolloff: -24 },
      },
    ],
  },
  {
    id: "80s-tape",
    name: "80s Tape",
    description: "Chorus + warm Drive + sub HPF",
    accent: "#ec4899",
    fx: [
      {
        type: "chorus",
        wet: 0.4,
        params: { frequency: 0.5, depth: 0.9, delayTime: 5, spread: 180 },
      },
      { type: "distortion", wet: 0.25, params: { drive: 0.15 } },
      {
        type: "highpassFilter",
        wet: 1,
        params: { frequency: 80, Q: 0.7, rolloff: -12 },
      },
    ],
  },
  {
    id: "ambient-pad",
    name: "Ambient Pad",
    description: "Slow Chorus + Hall Reverb + wide stereo",
    accent: "#0ea5e9",
    fx: [
      {
        type: "chorus",
        wet: 0.45,
        params: { frequency: 0.3, depth: 0.7, delayTime: 8, spread: 180 },
      },
      {
        type: "hallReverb",
        wet: 0.55,
        params: { decay: 8, preDelay: 0.1 },
      },
      { type: "stereoWidener", wet: 1, params: { width: 0.8 } },
    ],
  },
  {
    id: "trap-hat",
    name: "Trap Hi-Hat",
    description: "Fast Tremolo + Stutter Gate + top cut",
    accent: "#a855f7",
    fx: [
      {
        type: "tremolo",
        wet: 0.5,
        params: { frequency: 12, depth: 0.4, spread: 180 },
      },
      { type: "stutterGate", wet: 1, params: { rate: 16, depth: 0.7 } },
      {
        type: "lowpassFilter",
        wet: 1,
        params: { frequency: 10000, Q: 0.7, rolloff: -12 },
      },
    ],
  },
  {
    id: "vocal-air",
    name: "Vocal Air",
    description: "HPF + subtle Chorus + Vibrato + medium Hall",
    accent: "#f9a8d4",
    fx: [
      {
        type: "highpassFilter",
        wet: 1,
        params: { frequency: 120, Q: 0.7, rolloff: -12 },
      },
      {
        type: "chorus",
        wet: 0.25,
        params: { frequency: 1.5, depth: 0.3, delayTime: 3, spread: 90 },
      },
      { type: "vibrato", wet: 0.2, params: { frequency: 5, depth: 0.04 } },
      {
        type: "hallReverb",
        wet: 0.35,
        params: { decay: 3, preDelay: 0.05 },
      },
    ],
  },
]

export function FxChainContent({
  track,
  availableTracks,
  companySlug,
  onMutateEffects,
}: {
  track: MusicianTrack | null
  /** Tüm track listesi — SidechainComp source picker dropdown'u için.
   *  Default: aktif track içerikli liste; her zaman aktif track de
   *  dahil ama UI'da kendi kendini source seçmek mantıksız (filter UI'da). */
  availableTracks: MusicianTrack[]
  companySlug: string
  onMutateEffects(next: MusicianEffect[]): void
}) {
  const effects = track?.effects ?? []

  const addEffect = useCallback(
    (type: FxType) => {
      const id = `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const newFx: MusicianEffect = {
        id,
        type,
        enabled: true,
        wet: 0.3,
        params: defaultParamsForType(type),
      }
      onMutateEffects([...effects, newFx])
    },
    [effects, onMutateEffects],
  )

  const addEffectBundle = useCallback(
    (bundle: (typeof PRESET_BUNDLES)[number]) => {
      const ts = Date.now()
      const newFxList: MusicianEffect[] = bundle.fx.map((entry, idx) => ({
        id: `fx-${ts + idx}-${Math.random().toString(36).slice(2, 6)}`,
        type: entry.type,
        enabled: true,
        wet: entry.wet,
        params: entry.params,
      }))
      onMutateEffects([...effects, ...newFxList])
      toast.success(`Loaded preset "${bundle.name}" — ${bundle.fx.length} FX`)
    },
    [effects, onMutateEffects],
  )

  const removeEffect = useCallback(
    (id: string) => {
      onMutateEffects(effects.filter((e) => e.id !== id))
    },
    [effects, onMutateEffects],
  )

  const patchEffect = useCallback(
    (id: string, patch: Partial<MusicianEffect>) => {
      onMutateEffects(
        effects.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      )
    },
    [effects, onMutateEffects],
  )

  const patchEffectParams = useCallback(
    (id: string, paramPatch: Record<string, number | string | boolean>) => {
      onMutateEffects(
        effects.map((e) =>
          e.id === id ? { ...e, params: { ...e.params, ...paramPatch } } : e,
        ),
      )
    },
    [effects, onMutateEffects],
  )

  const reorderEffects = useCallback(
    (oldIdx: number, newIdx: number) => {
      if (oldIdx === newIdx) return
      if (oldIdx < 0 || newIdx < 0) return
      if (oldIdx >= effects.length || newIdx >= effects.length) return
      onMutateEffects(arrayMove(effects, oldIdx, newIdx))
    },
    [effects, onMutateEffects],
  )

  // dnd-kit sensors — drag 4px hareketten sonra başlasın; aksi halde
  // basit tıklama (knob drag, toggle) bile reorder tetikler.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  )
  const fxIds = useMemo(() => effects.map((e) => e.id), [effects])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIdx = fxIds.indexOf(String(active.id))
      const newIdx = fxIds.indexOf(String(over.id))
      reorderEffects(oldIdx, newIdx)
    },
    [fxIds, reorderEffects],
  )

  if (!track) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        Track gone — close this tab
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar — chain count + add effect */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          <span>Insert chain</span>
          <span className="font-mono text-neutral-400">
            ({effects.length} fx)
          </span>
          <span className="text-neutral-700">
            trackGain → {effects.map((_, i) => `fx${i + 1}`).join(" → ") || "—"} → pan → master
          </span>
        </div>
        <AddEffectPopover onPick={addEffect} onPickBundle={addEffectBundle} />
      </div>

      {/* Yatay scroll card-grid — her FX kendi mini-panel kartında.
          Tüm kontroller daima görünür; tıklayıp seçmek gerekmiyor.
          dnd-kit ile drag-to-reorder: kullanıcı card header'ındaki slot
          rozetinden sürükler. Chain sırası signal flow sırasını belirler
          (orj → fx1 → fx2 → ... → pan → master). */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        {effects.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-neutral-500">
            No effects in chain. Use “+ Add FX” to insert one.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={fxIds}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex h-full items-stretch gap-2 p-3">
                {effects.map((fx, idx) => (
                  <SortableFxCard
                    key={fx.id}
                    fx={fx}
                    companySlug={companySlug}
                    position={idx + 1}
                    availableTracks={availableTracks}
                    currentTrackId={track?.id ?? null}
                    onToggleEnabled={() =>
                      patchEffect(fx.id, { enabled: !fx.enabled })
                    }
                    onRemove={() => removeEffect(fx.id)}
                    onPatchWet={(wet) => patchEffect(fx.id, { wet })}
                    onPatchParams={(p) => patchEffectParams(fx.id, p)}
                  />
                ))}
                {/* End-of-chain inline insert */}
                <div className="flex shrink-0 items-center pl-1">
                  <AddEffectPopover
                    onPick={addEffect}
                    onPickBundle={addEffectBundle}
                    variant="inline"
                  />
                </div>
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}

// ─── SortableFxCard — dnd-kit wrapper around FxCard ──────────────────────

function SortableFxCard(props: {
  fx: MusicianEffect
  companySlug: string
  position: number
  availableTracks: MusicianTrack[]
  currentTrackId: string | null
  onToggleEnabled(): void
  onRemove(): void
  onPatchWet(wet: number): void
  onPatchParams(patch: Record<string, number | string | boolean>): void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.fx.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} className="flex shrink-0">
      <FxCard
        {...props}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
        isDragging={isDragging}
      />
    </div>
  )
}

// ─── FxCard — yatay rack-mounted card, daima açık kontroller ────────────

type DragHandleListeners = ReturnType<typeof useSortable>["listeners"]
type DragHandleAttributes = ReturnType<typeof useSortable>["attributes"]

function FxCard({
  fx,
  companySlug,
  position,
  availableTracks,
  currentTrackId,
  onToggleEnabled,
  onRemove,
  onPatchWet,
  onPatchParams,
  dragHandleListeners,
  dragHandleAttributes,
  isDragging,
}: {
  fx: MusicianEffect
  companySlug: string
  position: number
  availableTracks: MusicianTrack[]
  currentTrackId: string | null
  onToggleEnabled(): void
  onRemove(): void
  onPatchWet(wet: number): void
  onPatchParams(patch: Record<string, number | string | boolean>): void
  dragHandleListeners?: DragHandleListeners
  dragHandleAttributes?: DragHandleAttributes
  isDragging?: boolean
}) {
  const meta = FX_META[fx.type as FxType]
  const accent = meta?.accent ?? "#ec4899"
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden rounded-lg border bg-neutral-900/60 shadow-lg transition",
        !fx.enabled && "opacity-60",
        isDragging && "ring-2 ring-primary/70",
      )}
      style={{
        borderColor: fx.enabled ? `${accent}66` : "#27272a",
        boxShadow: fx.enabled
          ? `0 2px 14px -4px ${accent}40, inset 0 1px 0 rgba(255,255,255,0.04)`
          : undefined,
        // Card width FX tipine göre — knob sayısına bağlı
        minWidth: cardWidth(fx.type as FxType),
      }}
    >
      {/* Card header — title bar with chrome */}
      <div
        className="flex items-center gap-1.5 border-b border-neutral-800 px-2 py-1.5"
        style={{
          background: `linear-gradient(180deg, ${accent}22 0%, transparent 100%)`,
        }}
      >
        {/* Drag handle = slot rozeti. dnd-kit listeners burada;
            pointer-down → drag tetiklenir. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex h-5 w-5 cursor-grab items-center justify-center rounded bg-neutral-800/60 font-mono text-[9px] font-bold text-neutral-300 transition hover:bg-neutral-700 active:cursor-grabbing"
                {...dragHandleAttributes}
                {...dragHandleListeners}
              >
                {position}
              </button>
            }
          />
          <TooltipContent>Drag to reorder (slot {position})</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onToggleEnabled}
                className="text-neutral-400 hover:text-neutral-100"
              >
                <HugeiconsIcon
                  icon={fx.enabled ? ToggleOnIcon : ToggleOffIcon}
                  size={14}
                  className={fx.enabled ? "text-emerald-400" : ""}
                />
              </button>
            }
          />
          <TooltipContent>{fx.enabled ? "Bypass" : "Enable"}</TooltipContent>
        </Tooltip>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-xs font-bold uppercase tracking-wider"
            style={{ color: accent }}
          >
            {meta?.label ?? fx.type}
          </div>
        </div>
        <PresetPicker
          fx={fx}
          companySlug={companySlug}
          onLoadPreset={(p) => {
            onPatchWet(p.wet)
            onPatchParams(p.params)
            toast.success(`Loaded "${p.name}"`)
          }}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onRemove}
                className="text-neutral-500 hover:text-red-400"
              >
                <HugeiconsIcon icon={Delete01Icon} size={11} />
              </button>
            }
          />
          <TooltipContent>Remove from chain</TooltipContent>
        </Tooltip>
      </div>

      {/* Knob area */}
      <div className="flex flex-1 items-center justify-center px-4 py-3">
        <KnobMatrix
          fx={fx}
          accent={accent}
          availableTracks={availableTracks}
          currentTrackId={currentTrackId}
          onPatchParams={onPatchParams}
        />
      </div>

      {/* Wet/dry footer slider (sadece wet'i olan FX'ler) */}
      {hasWetParam(fx.type as FxType) && (
        <div className="border-t border-neutral-800 px-3 pb-2 pt-1.5">
          <ProSlider
            label="Wet / Dry"
            value={fx.wet ?? 0.3}
            onChange={onPatchWet}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.3}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            thickness="sm"
          />
        </div>
      )}
    </div>
  )
}

function cardWidth(type: FxType): number {
  // Knob sayısına göre min width — pratik defaults
  switch (type) {
    case "eq3":
      return 360
    case "compressor":
      return 360
    case "multibandCompressor":
      return 420
    case "phaser":
      return 300
    case "autoWah":
      return 300
    case "chorus":
      return 300
    case "tremolo":
      return 240
    case "filterSweep":
      return 240
    case "echo":
    case "reverb":
    case "feedbackDelay":
      return 200
    case "autoPanner":
    case "vibrato":
      return 200
    case "pitchShift":
      return 240
    case "frequencyShifter":
      return 150
    case "highpassFilter":
    case "lowpassFilter":
    case "bandpassFilter":
      return 240
    case "djFilter":
      return 200
    case "hallReverb":
      return 240
    case "pumpingComp":
      return 360
    case "stutterGate":
      return 200
    case "autoTune":
      return 320
    case "shimmerReverb":
      return 280
    case "harmonizer":
      return 380
    case "sidechainComp":
      return 300
    case "distortion":
      return 150
    case "stereoWidener":
      return 150
    case "limiter":
      return 150
    case "bitcrusher":
      return 130
    default:
      return 200
  }
}

// ─── AddEffectPopover ────────────────────────────────────────────────────

type AddFxCategoryKey =
  | "presets"
  | "dynamics"
  | "eq-filter"
  | "time"
  | "modulation"
  | "distortion"
  | "spatial"

const ADD_FX_CATEGORIES: {
  key: AddFxCategoryKey
  label: string
  accent: string
}[] = [
  { key: "presets", label: "Presets", accent: "#fb923c" },
  { key: "dynamics", label: "Dynamics", accent: "#eab308" },
  { key: "eq-filter", label: "EQ & Filter", accent: "#22c55e" },
  { key: "time", label: "Time-based", accent: "#06b6d4" },
  { key: "modulation", label: "Modulation", accent: "#a855f7" },
  { key: "distortion", label: "Distortion", accent: "#ef4444" },
  { key: "spatial", label: "Spatial", accent: "#0891b2" },
]

function AddEffectPopover({
  onPick,
  onPickBundle,
  variant = "compact",
}: {
  onPick(type: FxType): void
  onPickBundle?(bundle: (typeof PRESET_BUNDLES)[number]): void
  variant?: "compact" | "inline"
}) {
  // 2-column dropdown UX: sol kategori sidebar (sticky list) + sağ FX
  // listesi (aktif kategori filtrelenmiş). State category seçimini
  // saklar; default "presets" (multi-FX shortcuts öne çıkar).
  const [activeCategory, setActiveCategory] =
    useState<AddFxCategoryKey>("presets")

  // FX'leri kategoriye göre grupla — runtime'da memoized hesap yerine
  // her render'da yeniden grupluyoruz (FX_LIBRARY sabit, ucuz).
  const grouped: Record<string, typeof FX_LIBRARY> = {}
  for (const fx of FX_LIBRARY) {
    if (!grouped[fx.category]) grouped[fx.category] = []
    grouped[fx.category]!.push(fx)
  }

  const itemCount = (key: AddFxCategoryKey): number => {
    if (key === "presets") return onPickBundle ? PRESET_BUNDLES.length : 0
    return (grouped[key] ?? []).length
  }

  const visibleCategories = ADD_FX_CATEGORIES.filter(
    (c) => itemCount(c.key) > 0,
  )

  // Eğer presets disabled (onPickBundle yok) ve activeCategory hâlâ
  // "presets" ise ilk available kategoriye düş.
  const effectiveActive: AddFxCategoryKey =
    itemCount(activeCategory) === 0
      ? (visibleCategories[0]?.key ?? "dynamics")
      : activeCategory

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                variant === "inline" ? (
                  <button
                    type="button"
                    className="flex h-full min-h-[80px] w-12 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-neutral-800 text-neutral-500 transition hover:border-primary/60 hover:text-primary"
                  >
                    <HugeiconsIcon icon={Add01Icon} size={18} />
                    <span className="text-[9px] uppercase tracking-widest">
                      Add
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="flex h-6 items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-primary/20"
                  >
                    <HugeiconsIcon icon={Add01Icon} size={11} />
                    Add FX
                  </button>
                )
              }
            />
          }
        />
        <TooltipContent>Add effect or preset to chain</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        className="w-[480px] overflow-hidden p-0"
        align="end"
      >
        <div className="flex max-h-[440px]">
          {/* Sol kategori sidebar — sticky scroll-içi list; hover değil
              click ile sağ pane'i değiştirir. Active state primary/15 bg. */}
          <div className="w-36 shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-900/40 p-1">
            <div className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-neutral-500">
              Categories
            </div>
            {visibleCategories.map((cat) => {
              const active = effectiveActive === cat.key
              const count = itemCount(cat.key)
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition",
                    active
                      ? "bg-primary/15 font-medium text-primary"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100",
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: cat.accent }}
                  />
                  <span className="min-w-0 flex-1 truncate">{cat.label}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1 font-mono text-[8px]",
                      active
                        ? "bg-primary/20 text-primary"
                        : "bg-neutral-800 text-neutral-500",
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Sağ panel — aktif kategoriye göre item listesi.
              Presets ise bundle entry'leri, diğer kategoriler için FX entry'leri.
              DropdownMenuItem kullanıyoruz; native focus + click semantics korunur. */}
          <div className="min-w-0 flex-1 overflow-y-auto p-1">
            {effectiveActive === "presets" && onPickBundle
              ? PRESET_BUNDLES.map((bundle) => (
                  <DropdownMenuItem
                    key={bundle.id}
                    onClick={() => onPickBundle(bundle)}
                    className="flex items-start gap-2 py-2"
                  >
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: bundle.accent }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">
                          {bundle.name}
                        </span>
                        <span className="rounded bg-neutral-800 px-1 font-mono text-[8px] text-neutral-400">
                          {bundle.fx.length} fx
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {bundle.description}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))
              : (grouped[effectiveActive] ?? []).map((fx) => (
                  <DropdownMenuItem
                    key={fx.type}
                    onClick={() => onPick(fx.type)}
                    className="flex items-start gap-2 py-2"
                  >
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: fx.accent }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium">{fx.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {fx.description}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── PresetPicker — load + save ──────────────────────────────────────────

function PresetPicker({
  fx,
  companySlug,
  onLoadPreset,
}: {
  fx: MusicianEffect
  companySlug: string
  onLoadPreset(p: PresetDoc): void
}) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<PresetDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [newName, setNewName] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/companies/${companySlug}/studio/fx-presets?effectType=${fx.type}`,
        { credentials: "include" },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setPresets((json.data ?? []) as PresetDoc[])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preset load failed")
    } finally {
      setLoading(false)
    }
  }, [companySlug, fx.type])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const handleSave = useCallback(async () => {
    const name = newName.trim()
    if (!name) {
      toast.error("Preset name required")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(
        `/api/companies/${companySlug}/studio/fx-presets`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            effectType: fx.type,
            wet: fx.wet ?? 0.3,
            params: fx.params,
            isShared: false,
          }),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? `HTTP ${res.status}`)
      }
      toast.success(`Preset "${name}" saved`)
      setNewName("")
      setShowSaveForm(false)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }, [companySlug, fx.params, fx.type, fx.wet, newName, refresh])

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = await confirm({
        title: "Delete this preset?",
        description: "The saved FX preset will be removed for this company.",
        confirmText: "Delete",
        destructive: true,
      })
      if (!ok) return
      try {
        const res = await fetch(
          `/api/companies/${companySlug}/studio/fx-presets/${id}`,
          { method: "DELETE", credentials: "include" },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        toast.success("Deleted")
        await refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed")
      }
    },
    [companySlug, refresh],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex h-7 items-center gap-1 rounded border border-neutral-800 bg-neutral-900 px-2 text-[10px] font-bold uppercase tracking-widest text-neutral-300 hover:bg-neutral-800"
                >
                  <HugeiconsIcon icon={FloppyDiskIcon} size={11} />
                  Presets
                </button>
              }
            />
          }
        />
        <TooltipContent>Load or save preset</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-[9px] uppercase tracking-widest text-neutral-500">
            {FX_META[fx.type as FxType]?.label ?? fx.type} presets
          </div>
          <button
            type="button"
            onClick={() => setShowSaveForm((v) => !v)}
            className="text-[9px] font-bold uppercase tracking-widest text-primary hover:text-primary/80"
          >
            {showSaveForm ? "Cancel" : "+ Save current"}
          </button>
        </div>
        {showSaveForm && (
          <div className="mb-2 flex gap-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Preset name…"
              className="h-7 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave()
              }}
            />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !newName.trim()}
              className="h-7 bg-primary px-2 text-[10px] text-primary-foreground hover:bg-primary/80"
            >
              {saving ? (
                <HugeiconsIcon icon={Loading03Icon} size={10} className="animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </div>
        )}
        <div className="max-h-60 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-[10px] text-neutral-500">
              Loading…
            </div>
          ) : presets.length === 0 ? (
            <div className="p-4 text-center text-[10px] text-neutral-500">
              No presets yet
            </div>
          ) : (
            <ul className="space-y-0.5">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="group/preset flex items-center gap-2 rounded px-2 py-1 hover:bg-neutral-800"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onLoadPreset(p)
                      setOpen(false)
                    }}
                    className="min-w-0 flex-1 truncate text-left text-xs text-neutral-100"
                  >
                    {p.name}
                  </button>
                  {p.isShared && (
                    <span className="rounded bg-cyan-500/20 px-1 text-[8px] font-bold uppercase text-cyan-300">
                      shared
                    </span>
                  )}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => void handleDelete(p.id)}
                          className="text-neutral-500 opacity-0 transition hover:text-red-400 group-hover/preset:opacity-100"
                        >
                          <HugeiconsIcon icon={Delete01Icon} size={10} />
                        </button>
                      }
                    />
                    <TooltipContent>Delete preset</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── KnobMatrix — per-FX type pro-control layout ─────────────────────────

function KnobMatrix({
  fx,
  accent,
  availableTracks,
  currentTrackId,
  onPatchParams,
}: {
  fx: MusicianEffect
  accent: string
  availableTracks: MusicianTrack[]
  currentTrackId: string | null
  onPatchParams(patch: Record<string, number | string | boolean>): void
}) {
  const num = (k: string, fallback: number): number => {
    const v = fx.params[k]
    return typeof v === "number" ? v : fallback
  }

  switch (fx.type as FxType) {
    case "eq3":
      return (
        <div className="grid grid-cols-5 gap-x-4 gap-y-6">
          <ProKnob
            label="Low"
            value={num("low", 0)}
            onChange={(v) => onPatchParams({ low: v })}
            min={-24}
            max={24}
            step={0.5}
            defaultValue={0}
            bipolar
            size={56}
            accentColor="#22c55e"
            formatValue={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
          <ProKnob
            label="Mid"
            value={num("mid", 0)}
            onChange={(v) => onPatchParams({ mid: v })}
            min={-24}
            max={24}
            step={0.5}
            defaultValue={0}
            bipolar
            size={56}
            accentColor="#eab308"
            formatValue={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
          <ProKnob
            label="High"
            value={num("high", 0)}
            onChange={(v) => onPatchParams({ high: v })}
            min={-24}
            max={24}
            step={0.5}
            defaultValue={0}
            bipolar
            size={56}
            accentColor="#06b6d4"
            formatValue={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
          <ProKnob
            label="Low XO"
            value={num("lowFrequency", 400)}
            onChange={(v) => onPatchParams({ lowFrequency: v })}
            min={40}
            max={1000}
            step={10}
            defaultValue={400}
            size={48}
            formatValue={(v) => `${Math.round(v)} Hz`}
          />
          <ProKnob
            label="High XO"
            value={num("highFrequency", 2500)}
            onChange={(v) => onPatchParams({ highFrequency: v })}
            min={1000}
            max={12000}
            step={50}
            defaultValue={2500}
            size={48}
            formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
          />
        </div>
      )
    case "compressor":
      return (
        <div className="grid grid-cols-5 gap-x-4 gap-y-6">
          <ProKnob
            label="Threshold"
            value={num("threshold", -24)}
            onChange={(v) => onPatchParams({ threshold: v })}
            min={-60}
            max={0}
            step={0.5}
            defaultValue={-24}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)} dB`}
          />
          <ProKnob
            label="Ratio"
            value={num("ratio", 4)}
            onChange={(v) => onPatchParams({ ratio: v })}
            min={1}
            max={20}
            step={0.5}
            defaultValue={4}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)}:1`}
          />
          <ProKnob
            label="Attack"
            value={num("attack", 0.003)}
            onChange={(v) => onPatchParams({ attack: v })}
            min={0.001}
            max={0.5}
            step={0.001}
            defaultValue={0.003}
            size={48}
            accentColor="#06b6d4"
            formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
          />
          <ProKnob
            label="Release"
            value={num("release", 0.25)}
            onChange={(v) => onPatchParams({ release: v })}
            min={0.01}
            max={2}
            step={0.01}
            defaultValue={0.25}
            size={48}
            accentColor="#06b6d4"
            formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
          />
          <ProKnob
            label="Knee"
            value={num("knee", 30)}
            onChange={(v) => onPatchParams({ knee: v })}
            min={0}
            max={40}
            step={1}
            defaultValue={30}
            size={48}
            formatValue={(v) => `${Math.round(v)} dB`}
          />
        </div>
      )
    case "echo":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <ProKnob
            label="Delay"
            value={num("delayTime", 0.25)}
            onChange={(v) => onPatchParams({ delayTime: v })}
            min={0.05}
            max={1}
            step={0.01}
            defaultValue={0.25}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
          />
          <ProKnob
            label="Feedback"
            value={num("feedback", 0.5)}
            onChange={(v) => onPatchParams({ feedback: v })}
            min={0}
            max={0.95}
            step={0.01}
            defaultValue={0.5}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      )
    case "reverb":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <ProKnob
            label="Room"
            value={num("roomSize", 0.85)}
            onChange={(v) => onPatchParams({ roomSize: v })}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.85}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <ProKnob
            label="Damp"
            value={num("dampening", 3000)}
            onChange={(v) => onPatchParams({ dampening: v })}
            min={1000}
            max={10000}
            step={50}
            defaultValue={3000}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
          />
        </div>
      )
    case "phaser":
      return (
        <div className="grid grid-cols-4 gap-x-4 gap-y-6">
          <ProKnob
            label="LFO"
            value={num("frequency", 0.8)}
            onChange={(v) => onPatchParams({ frequency: v })}
            min={0}
            max={10}
            step={0.05}
            defaultValue={0.8}
            size={48}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(2)} Hz`}
          />
          <ProKnob
            label="Octaves"
            value={num("octaves", 4)}
            onChange={(v) => onPatchParams({ octaves: v })}
            min={0}
            max={6}
            step={1}
            defaultValue={4}
            size={48}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <ProKnob
            label="Base"
            value={num("baseFrequency", 350)}
            onChange={(v) => onPatchParams({ baseFrequency: v })}
            min={100}
            max={2000}
            step={10}
            defaultValue={350}
            size={48}
            formatValue={(v) => `${Math.round(v)} Hz`}
          />
          <ProKnob
            label="Q"
            value={num("Q", 8)}
            onChange={(v) => onPatchParams({ Q: v })}
            min={1}
            max={15}
            step={0.5}
            defaultValue={8}
            size={48}
            formatValue={(v) => v.toFixed(1)}
          />
        </div>
      )
    case "bitcrusher":
      return (
        <div className="flex">
          <ProKnob
            label="Bit Depth"
            value={num("bits", 3)}
            onChange={(v) => onPatchParams({ bits: v })}
            min={1}
            max={16}
            step={1}
            defaultValue={3}
            size={64}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v)} bit`}
          />
        </div>
      )
    case "filterSweep":
      return (
        <div className="grid grid-cols-3 gap-x-4 gap-y-6">
          <ProKnob
            label="LFO"
            value={num("frequency", 0.5)}
            onChange={(v) => onPatchParams({ frequency: v })}
            min={0.01}
            max={10}
            step={0.01}
            defaultValue={0.5}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(2)} Hz`}
          />
          <ProKnob
            label="Base"
            value={num("baseFrequency", 200)}
            onChange={(v) => onPatchParams({ baseFrequency: v })}
            min={50}
            max={2000}
            step={10}
            defaultValue={200}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v)} Hz`}
          />
          <ProKnob
            label="Octaves"
            value={num("octaves", 5)}
            onChange={(v) => onPatchParams({ octaves: v })}
            min={0}
            max={8}
            step={1}
            defaultValue={5}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v)}`}
          />
        </div>
      )
    case "distortion":
      return (
        <div className="flex">
          <ProKnob
            label="Drive"
            value={num("drive", 0.4)}
            onChange={(v) => onPatchParams({ drive: v })}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.4}
            size={64}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      )
    case "chorus":
      return (
        <div className="grid grid-cols-4 gap-x-4 gap-y-6">
          <ProKnob
            label="Rate"
            value={num("frequency", 1.5)}
            onChange={(v) => onPatchParams({ frequency: v })}
            min={0.1}
            max={10}
            step={0.1}
            defaultValue={1.5}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)} Hz`}
          />
          <ProKnob
            label="Delay"
            value={num("delayTime", 3.5)}
            onChange={(v) => onPatchParams({ delayTime: v })}
            min={1}
            max={20}
            step={0.1}
            defaultValue={3.5}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)} ms`}
          />
          <ProKnob
            label="Depth"
            value={num("depth", 0.7)}
            onChange={(v) => onPatchParams({ depth: v })}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.7}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <ProKnob
            label="Spread"
            value={num("spread", 180)}
            onChange={(v) => onPatchParams({ spread: v })}
            min={0}
            max={360}
            step={1}
            defaultValue={180}
            size={56}
            formatValue={(v) => `${Math.round(v)}°`}
          />
        </div>
      )
    case "tremolo":
      return (
        <div className="grid grid-cols-3 gap-x-4 gap-y-6">
          <ProKnob
            label="Rate"
            value={num("frequency", 5)}
            onChange={(v) => onPatchParams({ frequency: v })}
            min={0.1}
            max={20}
            step={0.1}
            defaultValue={5}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)} Hz`}
          />
          <ProKnob
            label="Depth"
            value={num("depth", 0.5)}
            onChange={(v) => onPatchParams({ depth: v })}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.5}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <ProKnob
            label="Spread"
            value={num("spread", 180)}
            onChange={(v) => onPatchParams({ spread: v })}
            min={0}
            max={360}
            step={1}
            defaultValue={180}
            size={56}
            formatValue={(v) => `${Math.round(v)}°`}
          />
        </div>
      )
    case "autoWah":
      return (
        <div className="grid grid-cols-4 gap-x-4 gap-y-6">
          <ProKnob
            label="Base Hz"
            value={num("baseFrequency", 100)}
            onChange={(v) => onPatchParams({ baseFrequency: v })}
            min={50}
            max={500}
            step={5}
            defaultValue={100}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <ProKnob
            label="Octaves"
            value={num("octaves", 6)}
            onChange={(v) => onPatchParams({ octaves: v })}
            min={1}
            max={8}
            step={1}
            defaultValue={6}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <ProKnob
            label="Sens"
            value={num("sensitivity", 0)}
            onChange={(v) => onPatchParams({ sensitivity: v })}
            min={-40}
            max={0}
            step={1}
            defaultValue={0}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v)} dB`}
          />
          <ProKnob
            label="Q"
            value={num("Q", 2)}
            onChange={(v) => onPatchParams({ Q: v })}
            min={0.5}
            max={20}
            step={0.1}
            defaultValue={2}
            size={56}
            formatValue={(v) => v.toFixed(1)}
          />
        </div>
      )
    case "stereoWidener":
      return (
        <div className="flex">
          <ProKnob
            label="Width"
            value={num("width", 0.5)}
            onChange={(v) => onPatchParams({ width: v })}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.5}
            size={64}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            bipolar={false}
          />
        </div>
      )
    case "multibandCompressor":
      return (
        <div className="space-y-4">
          {/* Crossover frekansları */}
          <div className="grid grid-cols-2 gap-x-4">
            <ProKnob
              label="Low XO"
              value={num("lowFrequency", 250)}
              onChange={(v) => onPatchParams({ lowFrequency: v })}
              min={60}
              max={1000}
              step={10}
              defaultValue={250}
              size={48}
              formatValue={(v) => `${Math.round(v)} Hz`}
            />
            <ProKnob
              label="High XO"
              value={num("highFrequency", 2500)}
              onChange={(v) => onPatchParams({ highFrequency: v })}
              min={1000}
              max={12000}
              step={50}
              defaultValue={2500}
              size={48}
              formatValue={(v) => `${(v / 1000).toFixed(1)} kHz`}
            />
          </div>
          {/* 3 band — threshold + ratio */}
          <div className="grid grid-cols-3 gap-x-3 gap-y-3 border-t border-neutral-800 pt-3">
            {(["low", "mid", "high"] as const).map((band) => {
              const bandColor =
                band === "low"
                  ? "#22c55e"
                  : band === "mid"
                    ? "#eab308"
                    : "#06b6d4"
              return (
                <div
                  key={band}
                  className="space-y-2 rounded border border-neutral-800 p-2"
                >
                  <div
                    className="text-center text-[9px] font-bold uppercase tracking-widest"
                    style={{ color: bandColor }}
                  >
                    {band}
                  </div>
                  <div className="flex justify-center gap-2">
                    <ProKnob
                      label="Thr"
                      value={num(`${band}Threshold`, -24)}
                      onChange={(v) =>
                        onPatchParams({ [`${band}Threshold`]: v })
                      }
                      min={-60}
                      max={0}
                      step={0.5}
                      defaultValue={-24}
                      size={40}
                      accentColor={bandColor}
                      formatValue={(v) => `${v.toFixed(0)} dB`}
                    />
                    <ProKnob
                      label="Ratio"
                      value={num(`${band}Ratio`, 4)}
                      onChange={(v) =>
                        onPatchParams({ [`${band}Ratio`]: v })
                      }
                      min={1}
                      max={20}
                      step={0.5}
                      defaultValue={4}
                      size={40}
                      accentColor={bandColor}
                      formatValue={(v) => `${v.toFixed(1)}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    case "limiter":
      return (
        <div className="flex">
          <ProKnob
            label="Ceiling"
            value={num("threshold", -3)}
            onChange={(v) => onPatchParams({ threshold: v })}
            min={-24}
            max={0}
            step={0.1}
            defaultValue={-3}
            size={64}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)} dB`}
          />
        </div>
      )
    case "pitchShift":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <ProKnob
            label="Pitch"
            value={num("pitch", 0)}
            onChange={(v) => onPatchParams({ pitch: v })}
            min={-24}
            max={24}
            step={1}
            defaultValue={0}
            bipolar
            size={64}
            accentColor={accent}
            formatValue={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} st`}
          />
          <ProKnob
            label="Window"
            value={num("windowSize", 0.1)}
            onChange={(v) => onPatchParams({ windowSize: v })}
            min={0.03}
            max={0.5}
            step={0.01}
            defaultValue={0.1}
            size={48}
            formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
          />
        </div>
      )
    case "djFilter":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <ProKnob
            label="Cutoff"
            value={num("cutoff", 0)}
            onChange={(v) => onPatchParams({ cutoff: v })}
            min={-1}
            max={1}
            step={0.01}
            defaultValue={0}
            bipolar
            size={64}
            accentColor={accent}
            formatValue={(v) =>
              v === 0
                ? "BYPASS"
                : v < 0
                  ? `HP ${Math.round(-v * 100)}%`
                  : `LP ${Math.round(v * 100)}%`
            }
          />
          <ProKnob
            label="Reso"
            value={num("Q", 1)}
            onChange={(v) => onPatchParams({ Q: v })}
            min={0.5}
            max={15}
            step={0.1}
            defaultValue={1}
            size={48}
            formatValue={(v) => v.toFixed(1)}
          />
        </div>
      )
    case "autoPanner":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <ProKnob
            label="Rate"
            value={num("frequency", 1)}
            onChange={(v) => onPatchParams({ frequency: v })}
            min={0.05}
            max={10}
            step={0.05}
            defaultValue={1}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(2)} Hz`}
          />
          <ProKnob
            label="Depth"
            value={num("depth", 1)}
            onChange={(v) => onPatchParams({ depth: v })}
            min={0}
            max={1}
            step={0.01}
            defaultValue={1}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      )
    case "frequencyShifter":
      return (
        <div className="flex">
          <ProKnob
            label="Shift"
            value={num("frequency", 0)}
            onChange={(v) => onPatchParams({ frequency: v })}
            min={-1000}
            max={1000}
            step={1}
            defaultValue={0}
            bipolar
            size={64}
            accentColor={accent}
            formatValue={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} Hz`}
          />
        </div>
      )
    case "vibrato":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <ProKnob
            label="Rate"
            value={num("frequency", 5)}
            onChange={(v) => onPatchParams({ frequency: v })}
            min={0.1}
            max={20}
            step={0.1}
            defaultValue={5}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)} Hz`}
          />
          <ProKnob
            label="Depth"
            value={num("depth", 0.1)}
            onChange={(v) => onPatchParams({ depth: v })}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.1}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      )
    case "highpassFilter":
    case "lowpassFilter":
    case "bandpassFilter": {
      const isBPF = (fx.type as FxType) === "bandpassFilter"
      const defaultFreq =
        (fx.type as FxType) === "highpassFilter"
          ? 200
          : (fx.type as FxType) === "lowpassFilter"
            ? 4000
            : 1000
      return (
        <div className="grid grid-cols-3 gap-x-4 gap-y-6">
          <ProKnob
            label="Freq"
            value={num("frequency", defaultFreq)}
            onChange={(v) => onPatchParams({ frequency: v })}
            min={20}
            max={20000}
            step={1}
            defaultValue={defaultFreq}
            size={56}
            accentColor={accent}
            formatValue={(v) =>
              v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${Math.round(v)} Hz`
            }
          />
          <ProKnob
            label="Q"
            value={num("Q", isBPF ? 2 : 1)}
            onChange={(v) => onPatchParams({ Q: v })}
            min={0.1}
            max={18}
            step={0.1}
            defaultValue={isBPF ? 2 : 1}
            size={48}
            formatValue={(v) => v.toFixed(1)}
          />
          <ProKnob
            label="Slope"
            value={num("rolloff", -24)}
            onChange={(v) => {
              // Snap to -12 / -24 / -48 / -96
              const slopes = [-12, -24, -48, -96]
              const nearest = slopes.reduce((a, b) =>
                Math.abs(b - v) < Math.abs(a - v) ? b : a,
              )
              onPatchParams({ rolloff: nearest })
            }}
            min={-96}
            max={-12}
            step={1}
            defaultValue={-24}
            size={48}
            formatValue={(v) => `${Math.round(v)} dB/oct`}
          />
        </div>
      )
    }
    case "feedbackDelay":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <ProKnob
            label="Delay"
            value={num("delayTime", 0.375)}
            onChange={(v) => onPatchParams({ delayTime: v })}
            min={0.02}
            max={2}
            step={0.005}
            defaultValue={0.375}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
          />
          <ProKnob
            label="Feedback"
            value={num("feedback", 0.6)}
            onChange={(v) => onPatchParams({ feedback: v })}
            min={0}
            max={0.95}
            step={0.01}
            defaultValue={0.6}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      )
    case "pumpingComp":
      return (
        <div className="grid grid-cols-3 gap-x-3 gap-y-4">
          <ProKnob
            label="Threshold"
            value={num("threshold", -18)}
            onChange={(v) => onPatchParams({ threshold: v })}
            min={-48}
            max={0}
            step={0.5}
            defaultValue={-18}
            size={48}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)} dB`}
          />
          <ProKnob
            label="Ratio"
            value={num("ratio", 8)}
            onChange={(v) => onPatchParams({ ratio: v })}
            min={2}
            max={20}
            step={0.5}
            defaultValue={8}
            size={48}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)}:1`}
          />
          <ProKnob
            label="Release"
            value={num("release", 0.15)}
            onChange={(v) => onPatchParams({ release: v })}
            min={0.01}
            max={1}
            step={0.01}
            defaultValue={0.15}
            size={48}
            accentColor="#06b6d4"
            formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
          />
          <ProKnob
            label="Pump Rate"
            value={num("rate", 2)}
            onChange={(v) => onPatchParams({ rate: v })}
            min={0.25}
            max={16}
            step={0.05}
            defaultValue={2}
            size={48}
            accentColor="#a855f7"
            formatValue={(v) => `${v.toFixed(2)} Hz`}
          />
          <ProKnob
            label="Pump Depth"
            value={num("depth", 18)}
            onChange={(v) => onPatchParams({ depth: v })}
            min={0}
            max={36}
            step={0.5}
            defaultValue={18}
            size={48}
            accentColor="#a855f7"
            formatValue={(v) => `${v.toFixed(1)} dB`}
          />
          <ProKnob
            label="Attack"
            value={num("attack", 0.001)}
            onChange={(v) => onPatchParams({ attack: v })}
            min={0.0005}
            max={0.1}
            step={0.0005}
            defaultValue={0.001}
            size={48}
            formatValue={(v) => `${(v * 1000).toFixed(1)} ms`}
          />
        </div>
      )
    case "hallReverb":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <ProKnob
            label="Decay"
            value={num("decay", 4)}
            onChange={(v) => onPatchParams({ decay: v })}
            min={0.5}
            max={20}
            step={0.1}
            defaultValue={4}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)}s`}
          />
          <ProKnob
            label="Pre-Delay"
            value={num("preDelay", 0.05)}
            onChange={(v) => onPatchParams({ preDelay: v })}
            min={0}
            max={0.5}
            step={0.005}
            defaultValue={0.05}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
          />
        </div>
      )
    case "stutterGate":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <ProKnob
            label="Rate"
            value={num("rate", 8)}
            onChange={(v) => onPatchParams({ rate: v })}
            min={0.5}
            max={32}
            step={0.5}
            defaultValue={8}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)} Hz`}
          />
          <ProKnob
            label="Depth"
            value={num("depth", 0.9)}
            onChange={(v) => onPatchParams({ depth: v })}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.9}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      )
    case "sidechainComp": {
      // Source dropdown: kendi track'ini exclude et (self-sidechain feedback
      // loop oluşturur). Empty string = no source (bypass duck, gain=1).
      const sourceId =
        typeof fx.params.sourceTrackId === "string"
          ? fx.params.sourceTrackId
          : ""
      const eligibleSources = availableTracks.filter(
        (t) => t.id !== currentTrackId,
      )
      return (
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-center text-[8px] font-bold uppercase tracking-widest text-neutral-500">
              Source track
            </div>
            <select
              value={sourceId}
              onChange={(e) =>
                onPatchParams({ sourceTrackId: e.target.value })
              }
              className="h-7 w-full rounded border border-neutral-800 bg-neutral-900 px-1 text-xs text-neutral-100"
            >
              <option value="">— None (bypass) —</option>
              {eligibleSources.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {sourceId && (
              <div className="mt-1 text-center text-[9px] text-neutral-500">
                Duck triggered by{" "}
                <span style={{ color: accent }} className="font-bold">
                  {eligibleSources.find((t) => t.id === sourceId)?.name ??
                    "(deleted)"}
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-neutral-800 pt-3">
            <ProKnob
              label="Amount"
              value={num("amount", 0.7)}
              onChange={(v) => onPatchParams({ amount: v })}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.7}
              size={48}
              accentColor={accent}
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
            <ProKnob
              label="Release"
              value={num("release", 0.15)}
              onChange={(v) => onPatchParams({ release: v })}
              min={0.01}
              max={1}
              step={0.01}
              defaultValue={0.15}
              size={48}
              accentColor="#06b6d4"
              formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
            />
          </div>
        </div>
      )
    }
    case "shimmerReverb":
      return (
        <div className="grid grid-cols-3 gap-x-4 gap-y-6">
          <ProKnob
            label="Pitch"
            value={num("pitch", 12)}
            onChange={(v) => onPatchParams({ pitch: v })}
            min={-12}
            max={24}
            step={1}
            defaultValue={12}
            bipolar
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} st`}
          />
          <ProKnob
            label="Decay"
            value={num("decay", 6)}
            onChange={(v) => onPatchParams({ decay: v })}
            min={1}
            max={20}
            step={0.5}
            defaultValue={6}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${v.toFixed(1)}s`}
          />
          <ProKnob
            label="Feedback"
            value={num("feedback", 0.45)}
            onChange={(v) => onPatchParams({ feedback: v })}
            min={0}
            max={0.9}
            step={0.01}
            defaultValue={0.45}
            size={56}
            accentColor={accent}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      )
    case "harmonizer":
      return (
        <div className="space-y-2">
          {/* 3 voice rows — each: pitch knob + mix knob, color-coded */}
          {(
            [
              { idx: 1 as const, color: "#22c55e", label: "Voice 1" },
              { idx: 2 as const, color: "#eab308", label: "Voice 2" },
              { idx: 3 as const, color: "#06b6d4", label: "Voice 3" },
            ]
          ).map(({ idx, color, label }) => {
            const defaultPitch = idx === 1 ? 4 : idx === 2 ? 7 : 12
            const defaultMix = idx === 3 ? 0.4 : 0.6
            return (
              <div
                key={idx}
                className="flex items-center gap-3 rounded border border-neutral-800 px-2 py-1.5"
              >
                <span
                  className="w-16 shrink-0 text-[9px] font-bold uppercase tracking-widest"
                  style={{ color }}
                >
                  {label}
                </span>
                <ProKnob
                  label="Pitch"
                  value={num(`voice${idx}`, defaultPitch)}
                  onChange={(v) => onPatchParams({ [`voice${idx}`]: v })}
                  min={-24}
                  max={24}
                  step={1}
                  defaultValue={defaultPitch}
                  bipolar
                  size={40}
                  accentColor={color}
                  formatValue={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}`}
                />
                <ProKnob
                  label="Mix"
                  value={num(`mix${idx}`, defaultMix)}
                  onChange={(v) => onPatchParams({ [`mix${idx}`]: v })}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={defaultMix}
                  size={40}
                  accentColor={color}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
            )
          })}
        </div>
      )
    case "autoTune": {
      const KEY_NAMES = [
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
      ]
      const currentKey = num("key", 60)
      const currentKeyName = KEY_NAMES[currentKey % 12] ?? "C"
      const currentScale =
        (fx.params.scale as string | undefined) ?? "major"
      return (
        <div className="space-y-3">
          {/* Key + Scale selector row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-center text-[8px] font-bold uppercase tracking-widest text-neutral-500">
                Key
              </div>
              <select
                value={String(currentKey % 12)}
                onChange={(e) => {
                  const root = parseInt(e.target.value, 10)
                  const oct = Math.floor(currentKey / 12)
                  onPatchParams({ key: oct * 12 + root })
                }}
                className="h-7 w-full rounded border border-neutral-800 bg-neutral-900 px-1 text-center text-xs text-neutral-100"
              >
                {KEY_NAMES.map((name, idx) => (
                  <option key={name} value={String(idx)}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-center text-[8px] font-bold uppercase tracking-widest text-neutral-500">
                Scale
              </div>
              <select
                value={currentScale}
                onChange={(e) => onPatchParams({ scale: e.target.value })}
                className="h-7 w-full rounded border border-neutral-800 bg-neutral-900 px-1 text-center text-xs text-neutral-100"
              >
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="chromatic">Chromatic</option>
              </select>
            </div>
          </div>
          {/* Strength + Window knobs */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-neutral-800 pt-3">
            <ProKnob
              label="Strength"
              value={num("strength", 0.85)}
              onChange={(v) => onPatchParams({ strength: v })}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.85}
              size={48}
              accentColor={accent}
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
            <ProKnob
              label="Window"
              value={num("windowSize", 0.06)}
              onChange={(v) => onPatchParams({ windowSize: v })}
              min={0.02}
              max={0.2}
              step={0.005}
              defaultValue={0.06}
              size={48}
              formatValue={(v) => `${(v * 1000).toFixed(0)} ms`}
            />
          </div>
          <div className="text-center text-[9px] text-neutral-500">
            Snapping to{" "}
            <span style={{ color: accent }} className="font-bold">
              {currentKeyName} {currentScale}
            </span>
          </div>
        </div>
      )
    }
    default:
      return (
        <div className="text-xs text-neutral-500">
          No editor for type “{fx.type}”
        </div>
      )
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function hasWetParam(type: FxType): boolean {
  // Tek-purpose dinamik / EQ / spatial / filter node'lar wet/dry slider'a
  // sahip değil (her zaman in-line, %100 effective; bypass için enabled
  // toggle kullanılır). Pure Tone.Filter node'lar (HPF/LPF/BPF/djFilter)
  // wet/dry yok — already in-line.
  return (
    type !== "eq3" &&
    type !== "compressor" &&
    type !== "multibandCompressor" &&
    type !== "limiter" &&
    type !== "stereoWidener" &&
    type !== "highpassFilter" &&
    type !== "lowpassFilter" &&
    type !== "bandpassFilter" &&
    type !== "djFilter" &&
    type !== "pumpingComp" &&
    type !== "stutterGate" &&
    type !== "autoTune" &&
    type !== "sidechainComp"
  )
}

function defaultParamsForType(
  type: FxType,
): Record<string, number | string | boolean> {
  switch (type) {
    case "echo":
      return { delayTime: 0.25, feedback: 0.5 }
    case "reverb":
      return { roomSize: 0.85, dampening: 3000 }
    case "phaser":
      return { frequency: 0.8, octaves: 4, baseFrequency: 350, Q: 8 }
    case "bitcrusher":
      return { bits: 3 }
    case "filterSweep":
      return { frequency: 0.5, baseFrequency: 200, octaves: 5 }
    case "eq3":
      return {
        low: 0,
        mid: 0,
        high: 0,
        lowFrequency: 400,
        highFrequency: 2500,
      }
    case "compressor":
      return {
        threshold: -24,
        ratio: 4,
        attack: 0.003,
        release: 0.25,
        knee: 30,
      }
    case "distortion":
      return { drive: 0.4 }
    case "chorus":
      return {
        frequency: 1.5,
        delayTime: 3.5,
        depth: 0.7,
        spread: 180,
      }
    case "tremolo":
      return { frequency: 5, depth: 0.5, spread: 180 }
    case "autoWah":
      return {
        baseFrequency: 100,
        octaves: 6,
        sensitivity: 0,
        Q: 2,
      }
    case "stereoWidener":
      return { width: 0.5 }
    case "multibandCompressor":
      return {
        lowFrequency: 250,
        highFrequency: 2500,
        lowThreshold: -24,
        lowRatio: 4,
        midThreshold: -24,
        midRatio: 4,
        highThreshold: -24,
        highRatio: 4,
      }
    case "limiter":
      return { threshold: -3 }
    case "pitchShift":
      return { pitch: 0, windowSize: 0.1 }
    case "djFilter":
      return { cutoff: 0, Q: 1 }
    case "autoPanner":
      return { frequency: 1, depth: 1 }
    case "frequencyShifter":
      return { frequency: 0 }
    case "vibrato":
      return { frequency: 5, depth: 0.1 }
    case "highpassFilter":
      return { frequency: 200, Q: 1, rolloff: -24 }
    case "lowpassFilter":
      return { frequency: 4000, Q: 1, rolloff: -24 }
    case "bandpassFilter":
      return { frequency: 1000, Q: 2, rolloff: -12 }
    case "feedbackDelay":
      return { delayTime: 0.375, feedback: 0.6 }
    case "pumpingComp":
      return {
        threshold: -18,
        ratio: 8,
        attack: 0.001,
        release: 0.15,
        rate: 2,
        depth: 18,
      }
    case "hallReverb":
      return { decay: 4, preDelay: 0.05 }
    case "stutterGate":
      return { rate: 8, depth: 0.9 }
    case "autoTune":
      return {
        key: 60, // C4 MIDI
        scale: "major",
        strength: 0.85,
        windowSize: 0.06,
      }
    case "shimmerReverb":
      return { pitch: 12, decay: 6, feedback: 0.45 }
    case "harmonizer":
      return {
        voice1: 4, // major 3rd
        voice2: 7, // perfect 5th
        voice3: 12, // octave
        mix1: 0.6,
        mix2: 0.6,
        mix3: 0.4,
      }
    case "sidechainComp":
      return {
        sourceTrackId: "",
        amount: 0.7,
        release: 0.15,
      }
    default:
      return {}
  }
}
