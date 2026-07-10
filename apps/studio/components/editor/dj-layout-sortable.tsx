"use client"

import { useCallback, type ReactNode } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, DragDropHorizontalIcon } from "@hugeicons/core-free-icons"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@workspace/ui/lib/utils"
import { confirm } from "@workspace/console/stores/confirm"
import { useDjStore, type DeckId, DECK_ACCENTS } from "@/lib/dj-store"
import {
  ensureDeck as engineEnsureDeck,
  disposeDeck as engineDisposeDeck,
  disposeMixer as engineDisposeMixer,
} from "@/lib/audio-engine"

/** Layout item bir mixer mı? Mixer id'leri "mixer-" ile başlar. */
function isMixerId(item: string): boolean {
  return item.startsWith("mixer-")
}

/**
 * Yatay sortable container — `tree.layout` (deck id'leri + "mixer"
 * sentinel) item'larını DND ile yeniden sıralar. Kullanıcı sürükleme
 * handle'ı (header'daki ≡ ikonu) ile deck'leri ve mixer'i istediği
 * yere taşıyabilir.
 *
 * Add deck butonu sağ uçta — sonraki kullanılmamış harfi yeni deck
 * olarak yaratır (audio engine ensure + store ekler). Max 26 deck.
 *
 * Çağıran (DjEditor) deck ve mixer'in *içerik* render'ını verir; bu
 * dosya sadece sortable shell + handle.
 */
export function DjLayoutSortable({
  renderDeck,
  renderMixer,
}: {
  renderDeck(deckId: DeckId): ReactNode
  renderMixer(mixerId: string): ReactNode
}) {
  const layout = useDjStore((s) => s.tree.layout)
  const setLayout = useDjStore((s) => s.setLayout)
  const addDeck = useDjStore((s) => s.addDeck)
  const addMixer = useDjStore((s) => s.addMixer)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e
      if (!over || active.id === over.id) return
      const oldIndex = layout.indexOf(String(active.id))
      const newIndex = layout.indexOf(String(over.id))
      if (oldIndex < 0 || newIndex < 0) return
      const next = layout.slice()
      const [moved] = next.splice(oldIndex, 1)
      next.splice(newIndex, 0, moved!)
      setLayout(next)
    },
    [layout, setLayout],
  )

  const handleAddDeck = useCallback(() => {
    const id = addDeck()
    if (!id) {
      toast.error("Max 26 decks reached")
      return
    }
    engineEnsureDeck(id)
    toast.success(`Deck ${id} added`)
  }, [addDeck])

  const handleAddMixer = useCallback(() => {
    const id = addMixer()
    toast.success(`Mixer added (${id})`, {
      description: "Drag decks to its assignment dropdown to route audio",
    })
  }, [addMixer])

  return (
    <div className="flex w-full max-w-[2400px] items-stretch gap-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={layout} strategy={horizontalListSortingStrategy}>
          {layout.map((item) =>
            isMixerId(item) ? (
              <SortableItem key={item} id={item} kind="mixer" mixerId={item}>
                {renderMixer(item)}
              </SortableItem>
            ) : (
              <SortableItem key={item} id={item} kind="deck" deckId={item}>
                {renderDeck(item)}
              </SortableItem>
            ),
          )}
        </SortableContext>
      </DndContext>

      {/* Add deck + Add mixer buttons — sortable list'in sonunda */}
      <div className="flex shrink-0 flex-col gap-2">
        <button
          type="button"
          onClick={handleAddDeck}
          className="flex w-14 flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-800 bg-neutral-950/40 text-neutral-500 transition hover:border-neutral-700 hover:bg-neutral-900/40 hover:text-neutral-200"
          title="Add new deck (next available letter)"
        >
          <HugeiconsIcon icon={Add01Icon} size={20} />
          <span className="rotate-90 whitespace-nowrap text-[9px] font-bold uppercase tracking-widest">
            Add deck
          </span>
        </button>
        <button
          type="button"
          onClick={handleAddMixer}
          className="flex w-14 flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-700/40 bg-amber-500/5 text-amber-600/70 transition hover:border-amber-500/70 hover:bg-amber-500/10 hover:text-amber-300"
          title="Add new mixer — route decks via assignment dropdown"
        >
          <HugeiconsIcon icon={Add01Icon} size={20} />
          <span className="rotate-90 whitespace-nowrap text-[9px] font-bold uppercase tracking-widest">
            Add mixer
          </span>
        </button>
      </div>
    </div>
  )
}

function SortableItem({
  id,
  kind,
  deckId,
  mixerId,
  children,
}: {
  id: string
  kind: "deck" | "mixer"
  deckId?: DeckId
  mixerId?: string
  children: ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const removeDeck = useDjStore((s) => s.removeDeck)
  const ejectInStore = useDjStore((s) => s.ejectDeck)
  const removeMixer = useDjStore((s) => s.removeMixer)
  const mixerCount = useDjStore((s) => s.tree.mixers.length)

  const accent = deckId ? DECK_ACCENTS[deckId].hex : "#737373"

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 20 : "auto" as const,
  }

  const onRemoveDeck = useCallback(() => {
    if (!deckId) return
    // Tree + transport + engine kaynakları temizlenir. Store guard min
    // 2 deck zorunlu — bu durumda removeDeck no-op olur.
    engineDisposeDeck(deckId)
    ejectInStore(deckId)
    removeDeck(deckId)
  }, [deckId, ejectInStore, removeDeck])

  const onRemoveMixer = useCallback(async () => {
    if (!mixerId) return
    if (mixerCount <= 1) {
      toast.error("Last mixer cannot be removed")
      return
    }
    const ok = await confirm({
      title: "Remove this mixer?",
      description:
        "Assigned decks will fall back to the first remaining mixer.",
      confirmText: "Remove",
      destructive: true,
    })
    if (!ok) return
    removeMixer(mixerId)
    engineDisposeMixer(mixerId)
    toast.success("Mixer removed")
  }, [mixerId, mixerCount, removeMixer])

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex min-h-0 items-stretch self-stretch [&>*]:flex [&>*]:flex-1"
    >
      {children}
      {/* Drag handle + remove — item'ın üst kenarında küçük strip */}
      <div className="pointer-events-none absolute -top-2 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1">
        <button
          type="button"
          {...listeners}
          {...attributes}
          className={cn(
            "pointer-events-auto flex h-5 w-12 cursor-grab items-center justify-center rounded-md border bg-neutral-900 text-neutral-400 shadow-md transition hover:text-white active:cursor-grabbing",
          )}
          style={{ borderColor: `${accent}60` }}
          title={`Drag to reorder ${kind === "mixer" ? `mixer ${mixerId}` : `Deck ${deckId}`}`}
        >
          <HugeiconsIcon icon={DragDropHorizontalIcon} size={12} />
        </button>
        {kind === "deck" && (
          <button
            type="button"
            onClick={onRemoveDeck}
            className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded-md border border-red-500/40 bg-neutral-900 text-red-400 shadow-md transition hover:bg-red-500/20 hover:text-red-300"
            title={`Remove Deck ${deckId} (must keep at least 2 decks)`}
          >
            ×
          </button>
        )}
        {kind === "mixer" && mixerCount > 1 && (
          <button
            type="button"
            onClick={onRemoveMixer}
            className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded-md border border-red-500/40 bg-neutral-900 text-red-400 shadow-md transition hover:bg-red-500/20 hover:text-red-300"
            title="Remove mixer (assigned decks fall back to first remaining)"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
