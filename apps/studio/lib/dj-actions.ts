"use client"

import { toast } from "sonner"
import {
  useDjStore,
  type DeckId,
  HOTCUE_COUNT,
  getSyncPartner,
  getDeckIdsFromLayout,
} from "./dj-store"
import {
  ensureAudioContextStarted,
  playDeck as enginePlay,
  pauseDeck as enginePause,
  rampDeckPitch,
  setDeckLoop as engineSetLoop,
  getDeckPosition,
  jumpDeckTo as engineJump,
} from "./audio-engine"

/**
 * Sentroy Studio — yüksek seviye DJ aksiyonları (SYNC + AUTO-MIX).
 *
 * UI sadece tetikleyici; iş mantığı burada (store + audio engine'i
 * koordine eder). Auto-mix anim sırasında transient state için module
 * scope flag/cancel handle tutuluyor.
 */

const PITCH_RANGE = 0.16 // ±16% UI clamp (audio engine clamp'ı daha geniş)

/**
 * SYNC — toDeck'in pitch'ini fromDeck'in effective BPM'ine eşitler.
 * Tetik: kullanıcı SYNC butonuna basar (toDeck üzerinde).
 *
 * Her iki deck'in de BPM analizi tamamlanmış olmalı; eksikse uyarı.
 * BPM farkı ±16%'yı aşıyorsa clamp + uyarı (gerçek DJ deck'lerinde
 * pitch fader fiziksel limiti var; bizimki de aynı).
 */
export function syncDeckBpm(targetDeck: DeckId, fromDeck: DeckId): void {
  const state = useDjStore.getState()
  const target = state.tree.decks[targetDeck]
  const source = state.tree.decks[fromDeck]
  if (!target.bpm || !source.bpm) {
    toast.error("BPM analysis not ready — wait or set manually")
    return
  }
  const sourceEffective = source.bpm * (1 + source.pitch)
  const targetPitch = sourceEffective / target.bpm - 1
  const clamped = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, targetPitch))
  if (Math.abs(targetPitch - clamped) > 0.001) {
    toast.warning(
      `BPM diff exceeded ±16% (${(targetPitch * 100).toFixed(1)}%) — clamped`,
    )
  }
  state.patchTree((tree) => ({
    ...tree,
    decks: {
      ...tree.decks,
      [targetDeck]: { ...tree.decks[targetDeck], pitch: clamped, sync: true },
    },
  }))
}

/**
 * Otomatik SYNC — default partner (A↔B, C↔D) BPM'liyse onu kullanır,
 * yoksa diğer deck'ler arasında BPM'i tamamlanmış ilki seçilir. 4-deck
 * kurulumda kullanıcı manuel partner seçimi yapmak zorunda kalmaz.
 */
export function syncDeckAuto(targetDeck: DeckId): void {
  const state = useDjStore.getState()
  const target = state.tree.decks[targetDeck]
  if (!target.bpm) {
    toast.error("This deck's BPM analysis not ready — wait")
    return
  }
  const preferred = getSyncPartner(targetDeck)
  const allIds = getDeckIdsFromLayout(state.tree.layout)
  const order: DeckId[] = [
    preferred,
    ...allIds.filter((d) => d !== targetDeck && d !== preferred),
  ]
  for (const partner of order) {
    if (state.tree.decks[partner]?.bpm) {
      syncDeckBpm(targetDeck, partner)
      return
    }
  }
  toast.error("No other deck with BPM for sync — load tracks on other decks")
}

// ─── Global transport (master play/pause) ────────────────────────────────

/**
 * Toggle global playback. Pioneer DJM "Beat Sync All" davranışı:
 *   - En az 1 deck çalıyorsa → tüm çalanları pause (positions korunur)
 *   - Hiç çalan yoksa → loaded olan tüm deck'leri mevcut position'dan
 *     resume eder. Boş deck'ler dokunulmaz.
 *
 * Space tuşu + footer master play butonu bunu çağırır.
 */
export async function toggleAllPlayback(): Promise<void> {
  const state = useDjStore.getState()
  const ids = getDeckIdsFromLayout(state.tree.layout)
  const anyPlaying = ids.some((id) => state.transport[id]?.isPlaying)
  if (anyPlaying) {
    pauseAllDecks()
  } else {
    await playAllLoadedDecks()
  }
}

export function pauseAllDecks(): void {
  const state = useDjStore.getState()
  for (const id of getDeckIdsFromLayout(state.tree.layout)) {
    if (!state.transport[id]?.isPlaying) continue
    const pos = enginePause(id)
    state.setRuntime(id, { isPlaying: false, position: pos })
  }
}

export async function playAllLoadedDecks(): Promise<void> {
  await ensureAudioContextStarted()
  const state = useDjStore.getState()
  for (const id of getDeckIdsFromLayout(state.tree.layout)) {
    const rt = state.transport[id]
    if (!rt?.loaded || rt.isPlaying) continue
    const startPos =
      rt.position > 0 && rt.position < (rt.duration - 0.1) ? rt.position : 0
    enginePlay(id, startPos)
    state.setRuntime(id, { isPlaying: true, position: startPos })
  }
}

/**
 * Tek-deck toggle — Shift+Space ile focused deck için. focused null'sa
 * no-op (kullanıcı henüz hiçbir deck'e dokunmamış).
 */
export async function toggleFocusedDeck(): Promise<void> {
  const state = useDjStore.getState()
  const id = state.focusedDeck
  if (!id) return
  const rt = state.transport[id]
  if (!rt.loaded) return
  if (rt.isPlaying) {
    const pos = enginePause(id)
    state.setRuntime(id, { isPlaying: false, position: pos })
  } else {
    await ensureAudioContextStarted()
    const startPos =
      rt.position > 0 && rt.position < (rt.duration - 0.1) ? rt.position : 0
    enginePlay(id, startPos)
    state.setRuntime(id, { isPlaying: true, position: startPos })
  }
}

/** SYNC'i kapatır (visual indicator off; pitch korunur — kullanıcı manuel 0'lar). */
export function unsyncDeck(deckId: DeckId): void {
  useDjStore.getState().patchTree((tree) => ({
    ...tree,
    decks: {
      ...tree.decks,
      [deckId]: { ...tree.decks[deckId], sync: false },
    },
  }))
}

// ─── Quantize / beat snap ────────────────────────────────────────────────

/**
 * `position` saniyesini deck'in beat grid'ine snap eder. BPM ve
 * beatgridOffset yoksa orijinal position döner. Snap çözünürlüğü 1
 * downbeat (kullanıcı genelde beat-aligned cue/loop ister).
 */
export function snapToBeat(
  position: number,
  bpm: number | null,
  beatgridOffset: number,
): number {
  if (!bpm || bpm <= 0) return position
  const beatLen = 60 / bpm
  const relative = position - beatgridOffset
  const beat = Math.round(relative / beatLen)
  return Math.max(0, beatgridOffset + beat * beatLen)
}

function maybeSnap(deckId: DeckId, position: number): number {
  const state = useDjStore.getState()
  if (!state.tree.quantize) return position
  const deck = state.tree.decks[deckId]
  return snapToBeat(position, deck.bpm, deck.beatgridOffset ?? 0)
}

// ─── Per-deck keyboard shortcuts ─────────────────────────────────────────

/** Tek deck play/pause toggle — keyboard shortcut 1/2/3/4 için. */
export async function togglePlayDeck(deckId: DeckId): Promise<void> {
  const state = useDjStore.getState()
  const rt = state.transport[deckId]
  if (!rt.loaded) return
  if (rt.isPlaying) {
    const pos = enginePause(deckId)
    state.setRuntime(deckId, { isPlaying: false, position: pos })
  } else {
    await ensureAudioContextStarted()
    const startPos =
      rt.position > 0 && rt.position < rt.duration - 0.1 ? rt.position : 0
    enginePlay(deckId, startPos)
    state.setRuntime(deckId, { isPlaying: true, position: startPos })
  }
}

/**
 * CDJ CUE — çalıyorsa cue noktasına (hotcue slot 1, yoksa 0) dön + pause;
 * durmuş ise current position'dan oynat. Keyboard shortcut Q/W/E/R.
 */
export async function cueDeck(deckId: DeckId): Promise<void> {
  const state = useDjStore.getState()
  const rt = state.transport[deckId]
  if (!rt.loaded) return
  const deck = state.tree.decks[deckId]
  if (rt.isPlaying) {
    enginePause(deckId)
    const cuePos = deck.hotcues.find((h) => h.slot === 1)?.position ?? 0
    engineJump(deckId, cuePos, false)
    state.setRuntime(deckId, { isPlaying: false, position: cuePos })
  } else {
    await ensureAudioContextStarted()
    enginePlay(deckId, rt.position)
    state.setRuntime(deckId, { isPlaying: true })
  }
}

/**
 * Hotcue ekle — focused deck'in sonraki boş slot'una current position
 * yazar. Tüm slot'lar doluysa uyarı. Keyboard shortcut H.
 */
export function addHotcueAtCurrentPosition(deckId: DeckId): void {
  const state = useDjStore.getState()
  const rt = state.transport[deckId]
  if (!rt.loaded) return
  const used = new Set(state.tree.decks[deckId].hotcues.map((h) => h.slot))
  for (let slot = 1; slot <= HOTCUE_COUNT; slot++) {
    if (!used.has(slot)) {
      state.setHotcue(deckId, slot, { position: maybeSnap(deckId, rt.position) })
      return
    }
  }
  toast.warning("All hotcue slots full")
}

/** Loop set/toggle — focused deck. Loop yoksa current'tan 4 beat
 *  loop yarat; loop varsa enabled'i toggle. Keyboard shortcut L. */
export function toggleOrCreateLoop(deckId: DeckId): void {
  const state = useDjStore.getState()
  const rt = state.transport[deckId]
  if (!rt.loaded) return
  const deck = state.tree.decks[deckId]
  const existing = deck.loops[0]
  if (existing) {
    // Toggle enabled/disabled
    const willBeEnabled = !existing.enabled
    state.toggleLoop(deckId)
    if (willBeEnabled) {
      // Loop yeniden aktivasyon — slip baseline kaydet
      slipBaseline.set(deckId, {
        pos: rt.position,
        perfMs: performance.now(),
      })
    } else {
      // Loop deaktivasyon — slip aktifse virtual position'a sıçra
      handleSlipExit(deckId, deck.pitch, rt.isPlaying)
    }
    return
  }
  // Yeni 4-beat loop. BPM yoksa fallback 2sn. Quantize aktifse start
  // en yakın downbeat'e snap (loop end de auto-aligned olur).
  const beatLen = deck.bpm ? 60 / (deck.bpm * (1 + deck.pitch)) : 0.5
  const start = maybeSnap(deckId, rt.position)
  const end = start + 4 * beatLen
  state.setLoop(deckId, { start, end, enabled: true })
  slipBaseline.set(deckId, {
    pos: start,
    perfMs: performance.now(),
  })
}

const slipBaseline = new Map<DeckId, { pos: number; perfMs: number }>()

function handleSlipExit(deckId: DeckId, pitch: number, isPlaying: boolean): void {
  const baseline = slipBaseline.get(deckId)
  slipBaseline.delete(deckId)
  if (!baseline) return
  if (!isDeckSlipMode(deckId)) return
  const elapsedSec = (performance.now() - baseline.perfMs) / 1000
  const virtualPos = baseline.pos + elapsedSec * (1 + pitch)
  const state = useDjStore.getState()
  engineJump(deckId, virtualPos, isPlaying)
  state.setRuntime(deckId, { position: virtualPos })
  toast.info(`Slip → +${elapsedSec.toFixed(1)}s`)
}

/**
 * Aktif loop'u 0.5x veya 2x'e ölçekle — keyboard `[` / `]`. Loop start
 * sabit kalır, end değişir. Engine setDeckLoop ile anlık yansır
 * (tree.loops re-render → useEffect re-trigger).
 */
export function resizeActiveLoop(deckId: DeckId, factor: number): void {
  const state = useDjStore.getState()
  const deck = state.tree.decks[deckId]
  const loop = deck.loops[0]
  if (!loop || !loop.enabled) return
  const newEnd = loop.start + Math.max(0.01, (loop.end - loop.start) * factor)
  state.patchTree((tree) => ({
    ...tree,
    decks: {
      ...tree.decks,
      [deckId]: {
        ...tree.decks[deckId],
        loops: [
          { ...loop, end: newEnd },
          ...tree.decks[deckId].loops.slice(1),
        ],
      },
    },
  }))
}

/** Seek relative — keyboard ← / →. Çalıyorsa pozisyon güncellenir
 *  engine.seekDeck ile (transport restart), durmuş ise sadece offset. */
export function nudgeDeckPosition(deckId: DeckId, deltaSec: number): void {
  const state = useDjStore.getState()
  const rt = state.transport[deckId]
  if (!rt.loaded) return
  const newPos = Math.max(0, Math.min(rt.duration - 0.05, rt.position + deltaSec))
  engineJump(deckId, newPos, rt.isPlaying)
  state.setRuntime(deckId, { position: newPos })
}

// ─── Tap tempo + beat grid nudge + slip mode ────────────────────────────

const tapState = new Map<DeckId, number[]>()

/**
 * Tap tempo — kullanıcı her butona basışta interval kaydedilir, son N
 * tap'in ortalaması alınır. 2sn'den uzun aralık ya da deck değişimi
 * → sequence reset. Min 2 tap sonrası BPM güncellenir; daha çok tap =
 * daha doğru.
 */
export function tapTempo(deckId: DeckId): void {
  const now = performance.now()
  const taps = tapState.get(deckId) ?? []
  // 2sn üstü → reset
  if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
    taps.length = 0
  }
  taps.push(now)
  // Son 8 tap tutulur (yeterli sample, eski drift'i kırp)
  while (taps.length > 8) taps.shift()
  tapState.set(deckId, taps)
  if (taps.length < 2) return
  // Ortalama interval (ms) → BPM
  const intervals: number[] = []
  for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1])
  const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
  if (avgMs <= 0) return
  let bpm = 60000 / avgMs
  // Octave-fold into [70, 180]
  while (bpm < 70) bpm *= 2
  while (bpm > 180) bpm /= 2
  bpm = Math.round(bpm * 10) / 10
  useDjStore.getState().patchTree((tree) => ({
    ...tree,
    decks: {
      ...tree.decks,
      [deckId]: { ...tree.decks[deckId], bpm },
    },
  }))
}

/**
 * Beat grid nudge — beatgridOffset'i ±deltaSec kaydır. Pozitif sağa
 * (downbeat sonra), negatif sola. Otomatik BPM analizinin sample-
 * accurate olmadığı durumlarda kullanıcı manuel hizalama yapar.
 */
export function nudgeBeatGrid(deckId: DeckId, deltaSec: number): void {
  useDjStore.getState().patchTree((tree) => {
    const deck = tree.decks[deckId]
    const current = deck.beatgridOffset ?? 0
    return {
      ...tree,
      decks: {
        ...tree.decks,
        [deckId]: { ...deck, beatgridOffset: current + deltaSec },
      },
    }
  })
}

/**
 * Slip mode toggle. Slip aktifken loop kapanırsa deck, loop'a girmemiş
 * gibi "virtual" position'a sıçrar (Pioneer slip davranışı). Slip state
 * volatile — store'da değil, lokal Map.
 */
const slipModeState = new Map<DeckId, boolean>()

export function setDeckSlipMode(deckId: DeckId, enabled: boolean): void {
  slipModeState.set(deckId, enabled)
}

export function isDeckSlipMode(deckId: DeckId): boolean {
  return slipModeState.get(deckId) ?? false
}

// ─── Beat Repeat / Loop Roll ────────────────────────────────────────────

/**
 * Pioneer CDJ "Beat Loop" pad davranışı — kullanıcı pad'i basılı tutar,
 * deck o anki pozisyondan başlayarak `beats` uzunluğunda loop'a girer.
 * Pad bırakılınca loop kapanır + normal playback devam (loop içindeki
 * son position'dan ileri).
 *
 * BPM yoksa no-op. beats = 0.25, 0.5, 1, 2, 4, 8, 16 önerilen.
 */
export function beginBeatRepeat(deckId: DeckId, beats: number): void {
  const state = useDjStore.getState()
  const deck = state.tree.decks[deckId]
  if (!deck.bpm) {
    toast.error(`Deck ${deckId}: BPM analysis not ready`)
    return
  }
  if (!state.transport[deckId].loaded) return
  const beatLen = 60 / (deck.bpm * (1 + deck.pitch)) // effective BPM
  const start = getDeckPosition(deckId)
  const end = start + Math.max(0.01, beats * beatLen)
  engineSetLoop(deckId, { start, end, enabled: true })
}

/** Beat repeat'i kapat — loop kapanır, deck normal playback'e döner. */
export function endBeatRepeat(deckId: DeckId): void {
  engineSetLoop(deckId, null)
}

// ─── Auto-mix ────────────────────────────────────────────────────────────

interface AutoMixState {
  fromDeck: DeckId
  toDeck: DeckId
  startedAt: number
  fadeSeconds: number
  cancelPitchRamp?: () => void
  cancelIncomingRamp?: () => void
  cancelCrossfaderRAF: number | null
}

let activeAutoMix: AutoMixState | null = null

/** Auto-mix devam ediyor mu? UI badge için. */
export function getAutoMixState(): {
  active: boolean
  fromDeck: DeckId | null
  toDeck: DeckId | null
  progress: number
} {
  if (!activeAutoMix) {
    return { active: false, fromDeck: null, toDeck: null, progress: 0 }
  }
  const elapsed = performance.now() - activeAutoMix.startedAt
  const progress = Math.min(elapsed / (activeAutoMix.fadeSeconds * 1000), 1)
  return {
    active: true,
    fromDeck: activeAutoMix.fromDeck,
    toDeck: activeAutoMix.toDeck,
    progress,
  }
}

/**
 * Auto-mix — fromDeck'ten toDeck'e otomatik geçiş.
 *
 * Akış:
 *   1. toDeck'i 0'dan çalmaya başla (ensureAudioContextStarted)
 *   2. tempoMatch: fromDeck'in pitch'ini toDeck'in effective BPM'ine
 *      ramp et (smooth, fade boyunca)
 *   3. Crossfader pozisyonunu mevcut → opposite'e yumuşak ease-in-out
 *      ile interpolate (rAF)
 *   4. Bitince: fromDeck pause + sync flag off
 *
 * "Apple Music kalite" hissi için:
 *   - Crossfade eğrisi: ease-in-out cubic (lineer DJ jarring)
 *   - tempoMatch outgoing'i incoming'e doğru yumuşak çeker
 *   - beatSync v1.5'te (downbeat hizalama)
 */
export async function executeAutoMix(input: {
  fromDeck: DeckId
  toDeck: DeckId
}): Promise<void> {
  const state = useDjStore.getState()
  const { fromDeck, toDeck } = input
  const config = state.tree.crossfader.autoMix

  if (activeAutoMix) {
    toast.warning("Auto-mix already running")
    return
  }

  const target = state.tree.decks[toDeck]
  if (!target.loadedMediaId) {
    toast.error(`Deck ${toDeck} empty — load a track first`)
    return
  }

  await ensureAudioContextStarted()

  // 1. toDeck'i mevcut pozisyonundan başlat (kullanıcı pre-cue yapmış
  //    olabilir; 0'a sarmak yerine current position'ı koru).
  const toRuntime = state.transport[toDeck]
  const incomingStartPos =
    toRuntime.position > 0 && toRuntime.position < (toRuntime.duration - 0.1)
      ? toRuntime.position
      : 0
  enginePlay(toDeck, incomingStartPos)
  state.setRuntime(toDeck, {
    isPlaying: true,
    position: incomingStartPos,
    loaded: true,
  })

  // 2. tempoMatch — MEET-IN-THE-MIDDLE
  //    Outgoing (95 BPM) ↗ midBpm (~105)
  //    Incoming (120 BPM) ↘ midBpm (~105) → end natural (120)
  //    İlk yarı: outgoing hızlanır + incoming yavaşlar (mid'e doğru)
  //    İkinci yarı: outgoing aynı pitch tutar + incoming kendi BPM'ine geri döner
  let cancelPitchRamp: (() => void) | undefined
  let cancelIncomingRamp: (() => void) | undefined
  if (config.tempoMatch) {
    const source = state.tree.decks[fromDeck]
    const sourceBpm = source.bpm ?? 120
    const targetBpm = target.bpm ?? 120
    if (sourceBpm > 0 && targetBpm > 0) {
      // Mid BPM (basit aritmetik orta nokta)
      const midBpm = (sourceBpm * (1 + source.pitch) + targetBpm * (1 + target.pitch)) / 2
      // Outgoing'in mid'e ulaşması için gereken pitch
      const outgoingTargetPitch = midBpm / sourceBpm - 1
      const outgoingClamped = Math.max(
        -PITCH_RANGE,
        Math.min(PITCH_RANGE, outgoingTargetPitch),
      )
      cancelPitchRamp = rampDeckPitch(
        fromDeck,
        outgoingClamped,
        config.fadeSeconds,
        (newPitch) => {
          useDjStore.getState().patchTree((tree) => ({
            ...tree,
            decks: {
              ...tree.decks,
              [fromDeck]: { ...tree.decks[fromDeck], pitch: newPitch },
            },
          }))
        },
      )
      // Incoming başta mid'e slowed, sonra natural'a ramp.
      // İki aşamalı: incoming.pitch START = midBpm/targetBpm - 1 (negatif → slower)
      // sonra rampDeckPitch(incoming, 0, fadeSeconds) → 0 (natural) e ulaşır
      const incomingStartPitch = midBpm / targetBpm - 1
      const incomingStartClamped = Math.max(
        -PITCH_RANGE,
        Math.min(PITCH_RANGE, incomingStartPitch),
      )
      // Önce hızlıca set et (pitch jump'ı kabul ediyoruz, alternatif ramp 0'dan
      // başlardı ve incoming nominal BPM'le başlayıp ortada yavaşlardı — UX kötü)
      useDjStore.getState().patchTree((tree) => ({
        ...tree,
        decks: {
          ...tree.decks,
          [toDeck]: { ...tree.decks[toDeck], pitch: incomingStartClamped },
        },
      }))
      // Sonra fade boyunca 0'a (natural) ramp
      cancelIncomingRamp = rampDeckPitch(
        toDeck,
        0,
        config.fadeSeconds,
        (newPitch) => {
          useDjStore.getState().patchTree((tree) => ({
            ...tree,
            decks: {
              ...tree.decks,
              [toDeck]: { ...tree.decks[toDeck], pitch: newPitch },
            },
          }))
        },
      )
    }
  }

  // 3. Geçiş animasyonu — crossfader artık her zaman aktif (kullanıcı
  //    auto-mix'te from/to seçti → crossfader assign'ları da bunlara
  //    map edilir). Crossfader pozisyonu animate edilir, audio engine
  //    aDeck/bDeck'in gain'lerini constant-power curve ile yumuşatır.
  //
  //    Önce fromDeck'i A tarafına, toDeck'i B tarafına assign et;
  //    sonra position'ı -1 → +1 ramp et.
  useDjStore.getState().patchTree((tree) => ({
    ...tree,
    crossfader: {
      ...tree.crossfader,
      aDeck: fromDeck,
      bDeck: toDeck,
      position: -1, // start: full from-side
    },
  }))

  const startPos = -1
  const endPos = 1

  const startTime = performance.now()
  const durationMs = config.fadeSeconds * 1000

  const handle: AutoMixState = {
    fromDeck,
    toDeck,
    startedAt: startTime,
    fadeSeconds: config.fadeSeconds,
    cancelPitchRamp,
    cancelIncomingRamp,
    cancelCrossfaderRAF: null,
  }
  activeAutoMix = handle

  return new Promise<void>((resolve) => {
    function tick() {
      if (activeAutoMix !== handle) {
        // İptal edildi
        resolve()
        return
      }
      const elapsed = performance.now() - startTime
      const t = Math.min(elapsed / durationMs, 1)
      // Ease-in-out cubic
      const eased =
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      const newPos = startPos + (endPos - startPos) * eased
      useDjStore.getState().patchTree((tree) => ({
        ...tree,
        crossfader: { ...tree.crossfader, position: newPos },
      }))

      if (t < 1) {
        handle.cancelCrossfaderRAF = requestAnimationFrame(tick)
      } else {
        // 4. Bitir: outgoing track ÇALMAYA DEVAM EDER (crossfader sustu,
        //    fader -1/+1'de ses 0 → kullanıcı isterse hala mix'e geri
        //    çekebilir). Pioneer DJM davranışı: deck pause kullanıcının işi.
        useDjStore.getState().patchTree((tree) => ({
          ...tree,
          decks: {
            ...tree.decks,
            [fromDeck]: { ...tree.decks[fromDeck], sync: false },
          },
        }))
        activeAutoMix = null
        toast.success(`Auto-mix → Deck ${toDeck}`)
        resolve()
      }
    }
    handle.cancelCrossfaderRAF = requestAnimationFrame(tick)
  })
}

/** Devam eden auto-mix'i iptal eder (state olduğu yerde donar). */
export function cancelAutoMix(): void {
  if (!activeAutoMix) return
  if (activeAutoMix.cancelPitchRamp) activeAutoMix.cancelPitchRamp()
  if (activeAutoMix.cancelIncomingRamp) activeAutoMix.cancelIncomingRamp()
  if (activeAutoMix.cancelCrossfaderRAF !== null) {
    cancelAnimationFrame(activeAutoMix.cancelCrossfaderRAF)
  }
  activeAutoMix = null
  toast.info("Auto-mix cancelled")
}

/**
 * Mixer reset — tüm karıştırıcı state'ini neutral'a alır:
 *   - Crossfader pozisyonu → 0 (center)
 *   - Per-deck: EQ → 0, filter → 0 (bypass), FX → none, pitch → 0,
 *     gain → 0.85, sync flag → false
 *
 * Track loaded/queue/hotcues/loops DOKUNULMAZ — sadece mix kontrolleri.
 */
export function resetMixer(): void {
  const state = useDjStore.getState()
  state.patchTree((tree) => {
    const decks: typeof tree.decks = {}
    for (const [id, deck] of Object.entries(tree.decks)) {
      decks[id] = {
        ...deck,
        eq: { low: 0, mid: 0, high: 0 },
        filter: { cutoff: 0, resonance: 0.5 },
        fx: { type: "none", wet: 0.3 },
        pitch: 0,
        gain: 0.85,
        sync: false,
      }
    }
    return {
      ...tree,
      crossfader: { ...tree.crossfader, position: 0 },
      decks,
    }
  })
  toast.success("Mixer reset")
}
