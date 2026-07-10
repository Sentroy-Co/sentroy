"use client"

import * as Tone from "tone"
// Tone v15'in internal Effect base class'ı public effect/index'den
// export edilmemiş — deep import gerekli. Composite custom FX node'lar
// (ShimmerReverb, Harmonizer) için Tone.Effect subclass'lanır:
// connectEffect() send/return arası chain handler verir, wet/dry +
// CrossFade output otomatik.
import {
  Effect as ToneEffect,
  type EffectOptions as ToneEffectOptions,
} from "tone/build/esm/effect/Effect.js"

/**
 * Sentroy Studio — Musician (multitrack timeline) audio engine.
 *
 * Mimari:
 *   - Master Tone.Transport timeline pozisyonunu yönetir (.seconds,
 *     .start(), .pause(), .stop())
 *   - Her track için ayrı zincir: trackGain (volume/mute) → panner →
 *     masterGain → limiter → destination
 *   - Clip'ler Tone.Player nesnelerine bağlanır + Transport.sync ile
 *     başlangıç zamanına schedule edilir
 *   - Master/track/clip değişiklikleri schedule'ı yeniden yapılandırır
 *     (basit yaklaşım: tam rebuild her edit'te; v2'de incremental)
 *
 * DJ engine (audio-engine.ts) tamamen ayrı — paylaşılan ses
 * destination'ı/Tone.context aynı ama signal chain'ler izole.
 */

interface ClipHandle {
  clipId: string
  player: Tone.Player
  /** Master scheduler ID (Transport.schedule) — clear için. */
  eventId: number | null
  /** Pitch-shift node (Tone.PitchShift) — clip pitch semitone değişimi
   *  için player ile trackGain arasına insert edilir. Null = bypass. */
  pitchShiftNode: Tone.PitchShift | null
}

interface FxSlot {
  /** Schema slot id (MusicianEffect.id) — UI bunu reorder/remove için kullanır. */
  id: string
  type: string
  wet: number
  enabled: boolean
  /** Mevcut params snapshot — incremental update için. */
  params: Record<string, number | string | boolean>
  /** Asıl Tone audio node. Bypass / disable durumda null. */
  node: Tone.ToneAudioNode | null
}

interface TrackHandle {
  trackId: string
  trackGain: Tone.Gain
  panner: Tone.Panner
  /** Per-track FX chain — trackGain → fxChain[0] → fxChain[1] → ... → panner → meter.
   *  Chain boş veya tüm slot'lar disabled ise trackGain doğrudan panner'a. */
  fxChain: FxSlot[]
  /** Post-fader meter — UI VU bar için anlık dB değeri. Channels=2 stereo. */
  meter: Tone.Meter
  clips: Map<string, ClipHandle>
}

interface MusicianGraph {
  tracks: Map<string, TrackHandle>
  masterGain: Tone.Gain
  limiter: Tone.Limiter
  /** Master post-limiter meter — son aşama, UI master VU için. */
  masterMeter: Tone.Meter
  /** Master FFT tap — spectrum analyzer inspector tab için. */
  masterFFT: Tone.FFT
  /** Master waveform tap — oscilloscope için. */
  masterWaveform: Tone.Waveform
}

let graph: MusicianGraph | null = null

function getGraph(): MusicianGraph {
  if (typeof window === "undefined") {
    throw new Error("musician-engine: browser-only")
  }
  if (!graph) {
    const limiter = new Tone.Limiter(-0.5).toDestination()
    const masterMeter = new Tone.Meter({ smoothing: 0.6 })
    limiter.connect(masterMeter)
    // FFT + Waveform tap'ları post-limiter — spectrum inspector için.
    // Size: 2048 = ~46Hz/bin @ 48kHz (yeterli detay).
    const masterFFT = new Tone.FFT({ size: 2048, smoothing: 0.7 })
    const masterWaveform = new Tone.Waveform({ size: 2048 })
    limiter.connect(masterFFT)
    limiter.connect(masterWaveform)
    const masterGain = new Tone.Gain(1.0).connect(limiter)
    graph = {
      tracks: new Map(),
      masterGain,
      limiter,
      masterMeter,
      masterFFT,
      masterWaveform,
    }
  }
  return graph
}

let acStartPromise: Promise<void> | null = null
export function ensureAudioStarted(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (!acStartPromise) acStartPromise = Tone.start()
  return acStartPromise
}

// ─── Video export — master audio tap ─────────────────────────────────────
let masterStreamDest: MediaStreamAudioDestinationNode | null = null
/**
 * Master çıkışını (mixed, post-limiter) bir MediaStream'e tap eder — karaoke
 * video export'unda MediaRecorder'ın audio track kaynağı. Idempotent: node
 * yalnız bir kez oluşturulur ve limiter'a fan-out bağlanır (normal
 * destination'a giden sesi etkilemez; kullanıcı aynı anda duyar + kaydeder).
 */
export function getMasterAudioStream(): MediaStream {
  const g = getGraph()
  const raw = Tone.getContext().rawContext as unknown as AudioContext
  if (!masterStreamDest) {
    masterStreamDest = raw.createMediaStreamDestination()
    // Tone node → native AudioNode (ToneAudioNode.connect InputNode kabul eder).
    g.limiter.connect(masterStreamDest as unknown as Tone.ToneAudioNode)
  }
  return masterStreamDest.stream
}

// ─── Audio output device routing ─────────────────────────────────────────
//
// HEDEFLİ motor dokunuşu (davranış-koruyucu):
//   - Master: AudioContext.setSinkId (Chrome/Edge) — mevcut graph'a
//     dokunmaz, yalnız context'in fiziksel çıkış aygıtını değiştirir.
//   - Track başına: panner → masterGain kenarı kesilip panner →
//     MediaStreamAudioDestinationNode → gizli <audio srcObject> →
//     audio.setSinkId(deviceId) zincirine bağlanır. Volume/pan/mute/solo
//     panner'ın UPSTREAM'inde uygulandığı için aynen çalışmaya devam eder;
//     meter tap'ı da panner'da kaldığı için VU değişmez.
//   - Desteklenmeyen tarayıcıda (Safari) fonksiyonlar no-op/false döner —
//     UI feature-detect ile zaten gizler.

type SinkAudioContext = AudioContext & {
  setSinkId?: (deviceId: string) => Promise<void>
}
type SinkMediaElement = HTMLAudioElement & {
  setSinkId?: (deviceId: string) => Promise<void>
}

/** Master çıkışı yönlendirilebilir mi (AudioContext.setSinkId)? */
export function isMasterOutputRoutingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    "setSinkId" in AudioContext.prototype
  )
}

/** Track başına alternatif çıkış mümkün mü (HTMLMediaElement.setSinkId)? */
export function isTrackOutputRoutingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype
  )
}

/**
 * Master (Tone context) çıkışını bir aygıta yönlendir. `""` = sistem
 * varsayılanı. Desteklenmiyorsa false döner (no-op); hata fırlatabilir
 * (örn. aygıt yok) — caller toast'lar.
 */
export async function setMasterOutputDevice(deviceId: string): Promise<boolean> {
  if (!isMasterOutputRoutingSupported()) return false
  const raw = Tone.getContext().rawContext as unknown as SinkAudioContext
  if (typeof raw.setSinkId !== "function") return false
  await raw.setSinkId(deviceId)
  return true
}

interface TrackOutputRoute {
  deviceId: string
  streamDest: MediaStreamAudioDestinationNode
  audioEl: SinkMediaElement
}
const trackOutputRoutes = new Map<string, TrackOutputRoute>()

/**
 * Track'in çıkışını alternatif aygıta yönlendir / master'a geri döndür.
 * deviceId null → route sökülür, panner tekrar masterGain'e bağlanır.
 * Karaoke senaryosu: mix hoparlöre (master), lead vocal kulaklığa (route).
 */
export async function setTrackOutputDevice(
  trackId: string,
  deviceId: string | null,
): Promise<void> {
  if (typeof window === "undefined") return
  const g = getGraph()
  const h = ensureTrack(trackId)
  const existing = trackOutputRoutes.get(trackId)

  if (!deviceId) {
    if (!existing) return
    try {
      h.panner.disconnect(existing.streamDest as unknown as Tone.ToneAudioNode)
    } catch {}
    try {
      existing.audioEl.pause()
      existing.audioEl.srcObject = null
      existing.audioEl.remove()
    } catch {}
    trackOutputRoutes.delete(trackId)
    // Master bus'a güvenli geri dönüş
    try {
      h.panner.connect(g.masterGain)
    } catch {}
    return
  }

  if (!isTrackOutputRoutingSupported()) return

  if (existing) {
    if (existing.deviceId === deviceId) return
    await existing.audioEl.setSinkId!(deviceId)
    existing.deviceId = deviceId
    return
  }

  const raw = Tone.getContext().rawContext as unknown as AudioContext
  const streamDest = raw.createMediaStreamDestination()
  const audioEl = document.createElement("audio") as SinkMediaElement
  audioEl.style.display = "none"
  audioEl.srcObject = streamDest.stream
  audioEl.autoplay = true
  document.body.appendChild(audioEl)
  try {
    await audioEl.setSinkId!(deviceId)
    try {
      await audioEl.play()
    } catch {
      // Autoplay policy — kullanıcı jesti içinde çağrıldığı için nadiren
      // düşer; düşerse autoplay attribute'u ilk etkileşimde devreye girer.
    }
    // Route'u ancak sink başarılıysa kur — masterGain kenarını kes
    try {
      h.panner.disconnect(g.masterGain)
    } catch {}
    h.panner.connect(streamDest as unknown as Tone.ToneAudioNode)
    trackOutputRoutes.set(trackId, { deviceId, streamDest, audioEl })
  } catch (err) {
    // Başarısız — DOM'u temiz bırak, master route'a dokunulmadı
    try {
      audioEl.srcObject = null
      audioEl.remove()
    } catch {}
    throw err
  }
}

export function getTrackOutputDevice(trackId: string): string | null {
  return trackOutputRoutes.get(trackId)?.deviceId ?? null
}

/**
 * Aygıt listesi değişince çağrılır — yönlendirildiği aygıt kaybolan
 * track'ler master'a geri döndürülür. Dönen liste: fallback yapılan
 * trackId'ler (caller toast + UI state günceller).
 */
export async function reconcileTrackOutputs(
  availableDeviceIds: Set<string>,
): Promise<string[]> {
  const dropped: string[] = []
  for (const [trackId, route] of trackOutputRoutes) {
    if (!availableDeviceIds.has(route.deviceId)) {
      await setTrackOutputDevice(trackId, null)
      dropped.push(trackId)
    }
  }
  return dropped
}

// ─── Track create / remove ───────────────────────────────────────────────

export function ensureTrack(trackId: string): TrackHandle {
  const g = getGraph()
  const existing = g.tracks.get(trackId)
  if (existing) return existing
  // Signal chain: trackGain → fxChain → panner → masterGain
  //                                              ↘ meter (tap)
  const panner = new Tone.Panner(0).connect(g.masterGain)
  const meter = new Tone.Meter({ smoothing: 0.6 })
  panner.connect(meter) // fan-out tap; meter destination'a giden audio'yu etkilemez
  const trackGain = new Tone.Gain(0.85).connect(panner)
  const handle: TrackHandle = {
    trackId,
    trackGain,
    panner,
    meter,
    fxChain: [],
    clips: new Map(),
  }
  g.tracks.set(trackId, handle)
  return handle
}

export function removeTrack(trackId: string): void {
  if (typeof window === "undefined") return
  const g = getGraph()
  const handle = g.tracks.get(trackId)
  if (!handle) return
  // Alternatif çıkış route'u varsa gizli audio elementini de temizle
  const route = trackOutputRoutes.get(trackId)
  if (route) {
    try {
      route.audioEl.pause()
      route.audioEl.srcObject = null
      route.audioEl.remove()
    } catch {}
    trackOutputRoutes.delete(trackId)
  }
  // Tüm clip'leri dispose
  for (const c of handle.clips.values()) disposeClip(handle, c.clipId)
  for (const slot of handle.fxChain) disposeFxNode(slot)
  try {
    handle.trackGain.disconnect()
    handle.trackGain.dispose()
    handle.panner.disconnect()
    handle.panner.dispose()
    handle.meter.disconnect()
    handle.meter.dispose()
  } catch {}
  g.tracks.delete(trackId)
}

/**
 * Anlık meter dB değerleri — UI VU bar polling kullanır.
 * - getTrackMeterDb(id) → number (single value, stereo aggregate)
 * - getMasterMeterDb() → number
 * Tone.Meter `getValue()` smoothed dB döner (yaklaşık -80..+6).
 * Hiç track / sample play olmuyorsa -Infinity gelebilir; UI clamp eder.
 */
export function getTrackMeterDb(trackId: string): number {
  if (typeof window === "undefined") return -Infinity
  const g = getGraph()
  const t = g.tracks.get(trackId)
  if (!t) return -Infinity
  const v = t.meter.getValue()
  return typeof v === "number" ? v : -Infinity
}

export function getMasterMeterDb(): number {
  if (typeof window === "undefined") return -Infinity
  const g = getGraph()
  const v = g.masterMeter.getValue()
  return typeof v === "number" ? v : -Infinity
}

/**
 * Master FFT bin değerleri (dB array). Spectrum analyzer için her frame
 * okunur. Size = 2048/2 = 1024 bin; bin frekansı = sampleRate * binIdx / 2048.
 * Tipik 48kHz: bin 0 = 0Hz, bin 1023 = ~24kHz.
 */
export function getMasterFFT(): Float32Array {
  if (typeof window === "undefined") return new Float32Array(0)
  const g = getGraph()
  const v = g.masterFFT.getValue()
  return v as Float32Array
}

/**
 * Master waveform (oscilloscope) — -1..+1 sample array. Size 2048.
 */
export function getMasterWaveform(): Float32Array {
  if (typeof window === "undefined") return new Float32Array(0)
  const g = getGraph()
  const v = g.masterWaveform.getValue()
  return v as Float32Array
}

/**
 * AudioContext sample rate — FFT bin → Hz dönüşümü için UI tarafı kullanır.
 */
export function getSampleRate(): number {
  if (typeof window === "undefined") return 48000
  try {
    return Tone.getContext().sampleRate
  } catch {
    return 48000
  }
}

export function setTrackVolume(trackId: string, vol: number): void {
  if (typeof window === "undefined") return
  const h = ensureTrack(trackId)
  h.trackGain.gain.rampTo(Math.max(0, Math.min(1, vol)), 0.05)
}

export function setTrackPan(trackId: string, pan: number): void {
  if (typeof window === "undefined") return
  const h = ensureTrack(trackId)
  h.panner.pan.rampTo(Math.max(-1, Math.min(1, pan)), 0.05)
}

export function setTrackMuted(trackId: string, muted: boolean): void {
  if (typeof window === "undefined") return
  const h = ensureTrack(trackId)
  // BUGFIX: önceden unmute durumunda gain 0.85'e hard-set ediliyordu —
  // bu kullanıcının setTrackVolume ile az önce set ettiği değeri override
  // ediyordu (race condition: editor useEffect setTrackVolume sonra
  // setTrackMuted çağırdığı için track volume slider her render'da reset
  // oluyordu). Şimdi sadece mute → 0; unmute case'inde gain'e dokunma,
  // caller setTrackVolume ile zaten doğru değeri set etti.
  if (muted) {
    h.trackGain.gain.rampTo(0, 0.05)
  }
}

/**
 * Backward-compat — eski tek-slot API. effect type "none" ise chain'i
 * boşalt; aksi halde tek elemanlı chain kur.
 *
 * Yeni kod `setTrackFxChain` kullanmalı.
 */
export function setTrackFx(trackId: string, type: string, wet: number): void {
  if (typeof window === "undefined") return
  if (type === "none") {
    setTrackFxChain(trackId, [])
    return
  }
  setTrackFxChain(trackId, [
    {
      id: `legacy-${trackId}`,
      type,
      enabled: true,
      wet,
      params: {},
    },
  ])
}

export interface FxChainConfig {
  id: string
  type: string
  enabled: boolean
  wet?: number
  params: Record<string, number | string | boolean>
}

/**
 * Per-track FX chain — tüm chain'i atomik replace eder.
 *
 * Optimizasyon: chain shape (ID + type + enabled) aynı kaldıysa sadece
 * params + wet update; aksi halde dispose + rebuild. Knob drag UX'i için
 * önemli: her tick'te full rebuild olursa pop/click sesi gelir.
 */
export function setTrackFxChain(
  trackId: string,
  effects: FxChainConfig[],
): void {
  if (typeof window === "undefined") return
  const h = ensureTrack(trackId)

  // Shape eşit mi (id + type + enabled — sıralama dahil) — eşitse incremental update
  const shapeSame =
    h.fxChain.length === effects.length &&
    h.fxChain.every(
      (slot, i) =>
        slot.id === effects[i]?.id &&
        slot.type === effects[i]?.type &&
        slot.enabled === effects[i]?.enabled,
    )

  if (shapeSame) {
    for (let i = 0; i < effects.length; i++) {
      const slot = h.fxChain[i]!
      const cfg = effects[i]!
      const w = Math.max(0, Math.min(1, cfg.wet ?? 0.3))
      slot.wet = w
      slot.params = cfg.params
      if (slot.node) {
        applyFxParams(slot.node, slot.type, cfg.params)
        if (hasWet(slot.node)) slot.node.wet.rampTo(w, 0.05)
      }
    }
    return
  }

  // Full rebuild — eski chain'i dispose, yenisini kur
  try {
    h.trackGain.disconnect()
  } catch {}
  for (const slot of h.fxChain) disposeFxNode(slot)
  h.fxChain = []

  // Sadece enabled olanları wire'la; disabled slot'lar chain'de yer almaz
  // (UI'da görünür ama signal path'te yok). Slot kaydını koru (state preservation).
  const newSlots: FxSlot[] = effects.map((cfg) => {
    const w = Math.max(0, Math.min(1, cfg.wet ?? 0.3))
    const node = cfg.enabled ? createFxNode(cfg.type, w, cfg.params) : null
    return {
      id: cfg.id,
      type: cfg.type,
      wet: w,
      enabled: cfg.enabled,
      params: cfg.params,
      node,
    }
  })

  let cursor: Tone.ToneAudioNode = h.trackGain
  for (const slot of newSlots) {
    if (slot.node) {
      cursor.connect(slot.node)
      cursor = slot.node
    }
  }
  cursor.connect(h.panner)
  h.fxChain = newSlots
}

function disposeFxNode(slot: FxSlot): void {
  if (!slot.node) return
  // pumpingComp / stutterGate / autoTune composite FX'ler internal sub-node
  // (LFO, Analyser) ve interval timer'ları attach eder. Manuel temizle —
  // yoksa AudioContext'te oscillator leak veya timer leak olur.
  const composite = slot.node as unknown as {
    _pumpLfo?: Tone.LFO
    _gateLfo?: Tone.LFO
    _atAnalyser?: Tone.Analyser
    _atInterval?: ReturnType<typeof setInterval>
  }
  if (composite._pumpLfo) {
    try {
      composite._pumpLfo.stop()
      composite._pumpLfo.disconnect()
      composite._pumpLfo.dispose()
    } catch {}
  }
  if (composite._gateLfo) {
    try {
      composite._gateLfo.stop()
      composite._gateLfo.disconnect()
      composite._gateLfo.dispose()
    } catch {}
  }
  if (composite._atInterval) {
    try {
      clearInterval(composite._atInterval)
    } catch {}
  }
  if (composite._atAnalyser) {
    try {
      composite._atAnalyser.disconnect()
      composite._atAnalyser.dispose()
    } catch {}
  }
  try {
    slot.node.disconnect()
  } catch {}
  try {
    slot.node.dispose()
  } catch {}
  slot.node = null
}

function hasWet(node: Tone.ToneAudioNode): node is Tone.ToneAudioNode & {
  wet: Tone.Param<"normalRange">
} {
  return "wet" in node && (node as { wet?: unknown }).wet !== undefined
}

function num(
  params: Record<string, number | string | boolean>,
  key: string,
  fallback: number,
): number {
  const v = params[key]
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

function createFxNode(
  type: string,
  wet: number,
  params: Record<string, number | string | boolean>,
): Tone.ToneAudioNode | null {
  const w = Math.max(0, Math.min(1, wet))
  switch (type) {
    case "echo":
      return new Tone.PingPongDelay({
        delayTime: num(params, "delayTime", 0.25),
        feedback: num(params, "feedback", 0.5),
        wet: w,
      })
    case "reverb":
      return new Tone.Freeverb({
        roomSize: num(params, "roomSize", 0.85),
        dampening: num(params, "dampening", 3000),
        wet: w,
      })
    case "phaser":
      return new Tone.Phaser({
        frequency: num(params, "frequency", 0.8),
        octaves: num(params, "octaves", 4),
        baseFrequency: num(params, "baseFrequency", 350),
        Q: num(params, "Q", 8),
        wet: w,
      })
    case "bitcrusher": {
      const bc = new Tone.BitCrusher(num(params, "bits", 3))
      bc.wet.value = w
      return bc
    }
    case "filterSweep":
      return new Tone.AutoFilter({
        frequency: num(params, "frequency", 0.5),
        baseFrequency: num(params, "baseFrequency", 200),
        octaves: num(params, "octaves", 5),
        wet: w,
      }).start()
    case "eq3":
      // EQ3 wet/dry yok — her zaman 100% in-line. Bypass için
      // tüm bantları 0 dB'ye al (kullanıcı UI'da).
      return new Tone.EQ3({
        low: num(params, "low", 0),
        mid: num(params, "mid", 0),
        high: num(params, "high", 0),
        lowFrequency: num(params, "lowFrequency", 400),
        highFrequency: num(params, "highFrequency", 2500),
      })
    case "compressor":
      return new Tone.Compressor({
        threshold: num(params, "threshold", -24),
        ratio: num(params, "ratio", 4),
        attack: num(params, "attack", 0.003),
        release: num(params, "release", 0.25),
        knee: num(params, "knee", 30),
      })
    case "distortion":
      // Drive 0..1, oversample default "none"; wet curve standart
      return new Tone.Distortion({
        distortion: num(params, "drive", 0.4),
        oversample: "none",
        wet: w,
      })
    case "chorus":
      return new Tone.Chorus({
        frequency: num(params, "frequency", 1.5),
        delayTime: num(params, "delayTime", 3.5),
        depth: num(params, "depth", 0.7),
        spread: num(params, "spread", 180),
        wet: w,
      }).start()
    case "tremolo":
      return new Tone.Tremolo({
        frequency: num(params, "frequency", 5),
        depth: num(params, "depth", 0.5),
        spread: num(params, "spread", 180),
        wet: w,
      }).start()
    case "autoWah":
      return new Tone.AutoWah({
        baseFrequency: num(params, "baseFrequency", 100),
        octaves: num(params, "octaves", 6),
        sensitivity: num(params, "sensitivity", 0),
        Q: num(params, "Q", 2),
        wet: w,
      })
    case "stereoWidener":
      // wet/dry yok — kullanıcı width 0 yaparsa mono
      return new Tone.StereoWidener({
        width: num(params, "width", 0.5),
      })
    case "multibandCompressor":
      // 3-band MultibandCompressor — low/mid/high ayrı threshold + ratio
      // Tone.MultibandCompressor 3 sabit band sunar; her band'ın ayrı
      // Compressor'una `.low/.mid/.high` ile erişim.
      return new Tone.MultibandCompressor({
        lowFrequency: num(params, "lowFrequency", 250),
        highFrequency: num(params, "highFrequency", 2500),
        low: {
          threshold: num(params, "lowThreshold", -24),
          ratio: num(params, "lowRatio", 4),
        },
        mid: {
          threshold: num(params, "midThreshold", -24),
          ratio: num(params, "midRatio", 4),
        },
        high: {
          threshold: num(params, "highThreshold", -24),
          ratio: num(params, "highRatio", 4),
        },
      })
    case "limiter":
      // Per-track peak limiter — ceiling 0 dB altında dB clamp
      return new Tone.Limiter(num(params, "threshold", -3))
    case "pitchShift":
      // Track-level pitch shift (clip-level pitchShift'ten farklı — chain'in
      // herhangi bir noktasında insertable). Helium/god/demon voice için.
      return new Tone.PitchShift({
        pitch: num(params, "pitch", 0),
        windowSize: num(params, "windowSize", 0.1),
        wet: w,
      })
    case "djFilter": {
      // CDJ-style tek-knob HPF+LPF kombo.
      // cutoff -1..+1: <0 → HPF (mapped 20Hz→4kHz log), >0 → LPF (mapped
      // 20kHz→500Hz log), 0 → bypass (pass-through). Q ortak.
      // Implementation: tek Tone.Filter, type ve frequency runtime'da set.
      const cutoff = num(params, "cutoff", 0)
      const q = num(params, "Q", 1)
      const filter = new Tone.Filter({
        frequency: djFilterFreq(cutoff),
        type: cutoff < 0 ? "highpass" : cutoff > 0 ? "lowpass" : "allpass",
        rolloff: -24,
        Q: q,
      })
      return filter
    }
    case "autoPanner":
      return new Tone.AutoPanner({
        frequency: num(params, "frequency", 1),
        depth: num(params, "depth", 1),
        wet: w,
      }).start()
    case "frequencyShifter":
      // Linear Hz shift — non-musical (PitchShift musical semitones; bu
      // farklı). Klangstation alien FX.
      return new Tone.FrequencyShifter({
        frequency: num(params, "frequency", 0),
        wet: w,
      })
    case "vibrato":
      return new Tone.Vibrato({
        frequency: num(params, "frequency", 5),
        depth: num(params, "depth", 0.1),
        wet: w,
      })
    case "highpassFilter":
      return new Tone.Filter({
        frequency: num(params, "frequency", 200),
        type: "highpass",
        Q: num(params, "Q", 1),
        rolloff: rolloffParam(params, -24),
      })
    case "lowpassFilter":
      return new Tone.Filter({
        frequency: num(params, "frequency", 4000),
        type: "lowpass",
        Q: num(params, "Q", 1),
        rolloff: rolloffParam(params, -24),
      })
    case "bandpassFilter":
      return new Tone.Filter({
        frequency: num(params, "frequency", 1000),
        type: "bandpass",
        Q: num(params, "Q", 2),
        rolloff: rolloffParam(params, -12),
      })
    case "feedbackDelay":
      // Tek-tap mono dub delay — PingPongDelay'den farklı (stereo değil,
      // klasik feedback). Heavy reggae/dub için.
      return new Tone.FeedbackDelay({
        delayTime: num(params, "delayTime", 0.375),
        feedback: num(params, "feedback", 0.6),
        wet: w,
      })
    case "pumpingComp": {
      // "Sidechain Comp" ghost variant: gerçek sidechain bus yerine internal
      // LFO ile compressor threshold modülasyonu. Pumping kick-duck illüzyonu.
      // EDM/house signature. Tone.Compressor + Tone.LFO threshold'a connect.
      // LFO rate = sub-divisions (Hz cinsinden bpm-relative; default 2Hz ≈ 120bpm half).
      const comp = new Tone.Compressor({
        threshold: num(params, "threshold", -18),
        ratio: num(params, "ratio", 8),
        attack: num(params, "attack", 0.001),
        release: num(params, "release", 0.15),
      })
      const lfo = new Tone.LFO({
        frequency: num(params, "rate", 2),
        min: num(params, "threshold", -18),
        // depth dB cinsinden: max = baseThreshold + depth (yukarı kayar)
        max:
          num(params, "threshold", -18) +
          Math.max(0, num(params, "depth", 18)),
        type: "sawtooth",
      })
      lfo.connect(comp.threshold)
      lfo.start()
      // LFO'yu compressor'a "ek" olarak yapıştır — slot.node compressor;
      // dispose'da LFO ayrıca temizlenmeli. node'a `_pumpLfo` attach et.
      ;(comp as unknown as { _pumpLfo?: Tone.LFO })._pumpLfo = lfo
      return comp
    }
    case "hallReverb":
      // Tone.Reverb convolution-tabanlı, Freeverb'den farklı space.
      // decay (sec) + preDelay (sec) UI exposed; longer tails için.
      return new Tone.Reverb({
        decay: num(params, "decay", 4),
        preDelay: num(params, "preDelay", 0.05),
        wet: w,
      })
    case "stutterGate": {
      // Square-wave LFO amplitude gate — glitch-hop / dubstep slicer.
      // input → gain → output; gain'e LFO bağlanır (0..1 oscillation).
      // Tone.Gain + Tone.LFO subdivide; node = gain (chain slot), LFO ekte.
      const gateGain = new Tone.Gain(1)
      const lfo = new Tone.LFO({
        frequency: num(params, "rate", 8),
        min: 1 - Math.max(0, Math.min(1, num(params, "depth", 0.9))),
        max: 1,
        type: "square",
      })
      lfo.connect(gateGain.gain)
      lfo.start()
      ;(gateGain as unknown as { _gateLfo?: Tone.LFO })._gateLfo = lfo
      return gateGain
    }
    case "shimmerReverb":
      return new ShimmerReverb({
        pitch: num(params, "pitch", 12),
        decay: num(params, "decay", 6),
        feedback: num(params, "feedback", 0.45),
        wet: w,
      })
    case "harmonizer":
      return new Harmonizer({
        voice1: num(params, "voice1", 4),
        voice2: num(params, "voice2", 7),
        voice3: num(params, "voice3", 12),
        mix1: num(params, "mix1", 0.6),
        mix2: num(params, "mix2", 0.6),
        mix3: num(params, "mix3", 0.4),
        wet: w,
      })
    case "sidechainComp": {
      // Source track bağlama post-construction'da — setTrackFxChain
      // graph'a ekledikten sonra setFxSidechainSource() çağrılır.
      // params.sourceTrackId varsa createFxNode dönüşünde caller bağlar.
      const sc = new SidechainComp({
        amount: num(params, "amount", 0.7),
        attack: num(params, "attack", 0.005),
        release: num(params, "release", 0.15),
        wet: w,
      })
      // sourceTrackId varsa şimdi (ancak getGraph() hâlâ build sırasında
      // çağrılır — track Map güncel). Aşağıda lookup.
      const sourceTrackId =
        typeof params.sourceTrackId === "string"
          ? params.sourceTrackId
          : null
      if (sourceTrackId) {
        try {
          const g = getGraph()
          const src = g.tracks.get(sourceTrackId)
          if (src) sc.setSidechainSource(src.trackGain)
        } catch {}
      }
      return sc
    }
    case "autoTune": {
      // T-Pain Lite: PitchShift + real-time pitch detection (FFT) +
      // chromatic-scale snap. PitchShift'in INPUT'una tap olarak Analyser
      // bağlanır (Tone primitives `input` property expose eder). Polling
      // loop (setInterval ~30Hz) dominant Hz'i bul → MIDI'ye çevir →
      // belirlenen key+scale'in en yakın notesine snap → semitone diff'i
      // strength ile çarpıp PitchShift.pitch'e yansıt.
      const ps = new Tone.PitchShift({
        pitch: 0,
        windowSize: num(params, "windowSize", 0.06),
      })
      const analyser = new Tone.Analyser({
        type: "fft",
        size: 2048,
        smoothing: 0.4,
      })
      // Tap PRE-pitchshift signal (input). Tone Effect base exposes `input`
      // — accept the loose cast for analyser tap.
      try {
        ;(ps as unknown as { input: Tone.ToneAudioNode }).input.connect(analyser)
      } catch {}

      const key = typeof params.key === "number" ? params.key : 60 // MIDI C4
      const scaleStr =
        typeof params.scale === "string" ? params.scale : "major"
      const strength =
        typeof params.strength === "number" ? params.strength : 0.8

      const state: {
        key: number
        scale: "major" | "minor" | "chromatic"
        strength: number
      } = {
        key,
        scale:
          scaleStr === "minor" || scaleStr === "chromatic"
            ? scaleStr
            : "major",
        strength: Math.max(0, Math.min(1, strength)),
      }

      const sampleRate = Tone.getContext().sampleRate
      const fftSize = 2048
      const interval = setInterval(() => {
        try {
          const fft = analyser.getValue() as Float32Array
          if (!fft || fft.length === 0) return
          // Find dominant bin (skip first 4 — DC + sub-audio)
          let maxBin = 4
          let maxDb = -Infinity
          for (let i = 4; i < fft.length; i++) {
            const v = fft[i]!
            if (v > maxDb) {
              maxDb = v
              maxBin = i
            }
          }
          if (maxDb < -55) return // silence
          // bin → Hz: bin * sampleRate / fftSize (fftSize değil, fft.length*2)
          const detectedHz = (maxBin * sampleRate) / fftSize
          if (detectedHz < 70 || detectedHz > 3500) return // out of vocal range
          const detectedMidi = 12 * Math.log2(detectedHz / 440) + 69
          const snapped = snapToScale(detectedMidi, state.key, state.scale)
          const diff = snapped - detectedMidi
          const target = diff * state.strength
          // Smooth set — direct .pitch assignment (Tone PitchShift) immediate
          ps.pitch = target
        } catch {}
      }, 32)

      ;(ps as unknown as {
        _atAnalyser?: Tone.Analyser
        _atInterval?: ReturnType<typeof setInterval>
        _atState?: typeof state
      })._atAnalyser = analyser
      ;(ps as unknown as { _atInterval?: ReturnType<typeof setInterval> })
        ._atInterval = interval
      ;(ps as unknown as { _atState?: typeof state })._atState = state

      return ps
    }
    default:
      return null
  }
}

/**
 * MIDI note + key (MIDI root) + scale → nearest scale-conformant MIDI note.
 * - chromatic: round-to-nearest (semitone snap, scale-agnostic)
 * - major / minor: intervals tablosu içinden en yakın
 */
function snapToScale(
  midi: number,
  key: number,
  scale: "major" | "minor" | "chromatic",
): number {
  if (scale === "chromatic") return Math.round(midi)
  const intervals =
    scale === "major"
      ? [0, 2, 4, 5, 7, 9, 11]
      : [0, 2, 3, 5, 7, 8, 10]
  const offset = midi - key
  const octave = Math.floor(offset / 12)
  const semitoneInOct = ((offset % 12) + 12) % 12
  let bestDiff = Infinity
  let bestNote = intervals[0]!
  for (const iv of intervals) {
    const d = Math.abs(iv - semitoneInOct)
    if (d < bestDiff) {
      bestDiff = d
      bestNote = iv
    }
    // wrap (e.g. 11 might be closer to 0+12)
    const dWrap = Math.abs(12 + iv - semitoneInOct)
    if (dWrap < bestDiff) {
      bestDiff = dWrap
      bestNote = iv - 12 // wraps to upper octave's first interval
    }
    const dWrap2 = Math.abs(iv - 12 - semitoneInOct)
    if (dWrap2 < bestDiff) {
      bestDiff = dWrap2
      bestNote = iv
    }
  }
  return key + octave * 12 + bestNote
}

/**
 * DJ filter cutoff (-1..+1) → frekans Hz map.
 * Negatif tarafta: -1 = 4000Hz HPF (max HP cut), 0'a yaklaşırken 20Hz (bypass'a yakın).
 * Pozitif tarafta: 0'a yakın 20000Hz (bypass), +1 = 200Hz LPF (max LP cut).
 * Logaritmik scale — DJ mixer knob hissi.
 */
function djFilterFreq(cutoff: number): number {
  if (cutoff === 0) return 1000 // allpass için anlamsız ama placeholder
  if (cutoff < 0) {
    // HPF: -1 → 4000Hz, 0 → 20Hz
    const t = -cutoff // 0..1
    return 20 * Math.pow(4000 / 20, t)
  }
  // LPF: 0 → 20000Hz, +1 → 200Hz
  const t = cutoff // 0..1
  return 20000 * Math.pow(200 / 20000, t)
}

/**
 * Filter rolloff schema → Tone.Filter rolloff union value.
 * Schema'da number geliyor; Tone discriminated set: -12 | -24 | -48 | -96.
 */
function rolloffParam(
  params: Record<string, number | string | boolean>,
  fallback: -12 | -24 | -48 | -96,
): -12 | -24 | -48 | -96 {
  const v = params.rolloff
  if (v === -12 || v === -24 || v === -48 || v === -96) return v
  return fallback
}

/**
 * Aynı tipte mevcut node üzerinde live param update — knob drag'de pop/click
 * olmasın diye dispose'suz `.set()` çağırır. Tone v15 set() kabul eder.
 */
function applyFxParams(
  node: Tone.ToneAudioNode,
  type: string,
  params: Record<string, number | string | boolean>,
): void {
  try {
    switch (type) {
      case "echo": {
        const n = node as unknown as {
          delayTime: { value: number }
          feedback: { value: number }
        }
        if (typeof params.delayTime === "number")
          n.delayTime.value = params.delayTime
        if (typeof params.feedback === "number")
          n.feedback.value = params.feedback
        break
      }
      case "reverb": {
        const n = node as unknown as {
          roomSize: { value: number }
          dampening: number
        }
        if (typeof params.roomSize === "number")
          n.roomSize.value = params.roomSize
        if (typeof params.dampening === "number") n.dampening = params.dampening
        break
      }
      case "phaser": {
        const n = node as unknown as {
          frequency: { value: number }
          octaves: number
          baseFrequency: number
          Q: { value: number }
        }
        if (typeof params.frequency === "number")
          n.frequency.value = params.frequency
        if (typeof params.octaves === "number") n.octaves = params.octaves
        if (typeof params.baseFrequency === "number")
          n.baseFrequency = params.baseFrequency
        if (typeof params.Q === "number") n.Q.value = params.Q
        break
      }
      case "bitcrusher": {
        const n = node as unknown as { bits: { value: number } }
        if (typeof params.bits === "number") n.bits.value = params.bits
        break
      }
      case "filterSweep": {
        const n = node as unknown as {
          frequency: { value: number }
          baseFrequency: number
          octaves: number
        }
        if (typeof params.frequency === "number")
          n.frequency.value = params.frequency
        if (typeof params.baseFrequency === "number")
          n.baseFrequency = params.baseFrequency
        if (typeof params.octaves === "number") n.octaves = params.octaves
        break
      }
      case "eq3": {
        const n = node as unknown as {
          low: { value: number }
          mid: { value: number }
          high: { value: number }
          lowFrequency: { value: number }
          highFrequency: { value: number }
        }
        if (typeof params.low === "number") n.low.value = params.low
        if (typeof params.mid === "number") n.mid.value = params.mid
        if (typeof params.high === "number") n.high.value = params.high
        if (typeof params.lowFrequency === "number")
          n.lowFrequency.value = params.lowFrequency
        if (typeof params.highFrequency === "number")
          n.highFrequency.value = params.highFrequency
        break
      }
      case "compressor": {
        const n = node as unknown as {
          threshold: { value: number }
          ratio: { value: number }
          attack: { value: number }
          release: { value: number }
          knee: { value: number }
        }
        if (typeof params.threshold === "number")
          n.threshold.value = params.threshold
        if (typeof params.ratio === "number") n.ratio.value = params.ratio
        if (typeof params.attack === "number") n.attack.value = params.attack
        if (typeof params.release === "number")
          n.release.value = params.release
        if (typeof params.knee === "number") n.knee.value = params.knee
        break
      }
      case "distortion": {
        const n = node as unknown as {
          distortion: number
        }
        if (typeof params.drive === "number") n.distortion = params.drive
        break
      }
      case "chorus": {
        const n = node as unknown as {
          frequency: { value: number }
          delayTime: number
          depth: number
          spread: number
        }
        if (typeof params.frequency === "number")
          n.frequency.value = params.frequency
        if (typeof params.delayTime === "number") n.delayTime = params.delayTime
        if (typeof params.depth === "number") n.depth = params.depth
        if (typeof params.spread === "number") n.spread = params.spread
        break
      }
      case "tremolo": {
        const n = node as unknown as {
          frequency: { value: number }
          depth: { value: number }
          spread: number
        }
        if (typeof params.frequency === "number")
          n.frequency.value = params.frequency
        if (typeof params.depth === "number") n.depth.value = params.depth
        if (typeof params.spread === "number") n.spread = params.spread
        break
      }
      case "autoWah": {
        const n = node as unknown as {
          baseFrequency: number
          octaves: number
          sensitivity: number
          Q: { value: number }
        }
        if (typeof params.baseFrequency === "number")
          n.baseFrequency = params.baseFrequency
        if (typeof params.octaves === "number") n.octaves = params.octaves
        if (typeof params.sensitivity === "number")
          n.sensitivity = params.sensitivity
        if (typeof params.Q === "number") n.Q.value = params.Q
        break
      }
      case "stereoWidener": {
        const n = node as unknown as { width: { value: number } }
        if (typeof params.width === "number") n.width.value = params.width
        break
      }
      case "multibandCompressor": {
        // MultibandCompressor crossover frekanslarını live update için
        // dispose + recreate gerekir; bu yüzden burada sadece per-band
        // threshold/ratio'yu güncelliyoruz. Crossover değiştirme ChainConfig
        // shape diff'iyle rebuild tetikler.
        const n = node as unknown as {
          low: { threshold: { value: number }; ratio: { value: number } }
          mid: { threshold: { value: number }; ratio: { value: number } }
          high: { threshold: { value: number }; ratio: { value: number } }
        }
        if (typeof params.lowThreshold === "number")
          n.low.threshold.value = params.lowThreshold
        if (typeof params.lowRatio === "number")
          n.low.ratio.value = params.lowRatio
        if (typeof params.midThreshold === "number")
          n.mid.threshold.value = params.midThreshold
        if (typeof params.midRatio === "number")
          n.mid.ratio.value = params.midRatio
        if (typeof params.highThreshold === "number")
          n.high.threshold.value = params.highThreshold
        if (typeof params.highRatio === "number")
          n.high.ratio.value = params.highRatio
        break
      }
      case "limiter": {
        const n = node as unknown as { threshold: { value: number } }
        if (typeof params.threshold === "number")
          n.threshold.value = params.threshold
        break
      }
      case "pitchShift": {
        // Tone.PitchShift.pitch sayısal field — live re-set OK; windowSize
        // değişimi audible click yapabilir ama dispose'a tercih edilir.
        const n = node as unknown as {
          pitch: number
          windowSize: number
        }
        if (typeof params.pitch === "number") n.pitch = params.pitch
        if (typeof params.windowSize === "number") n.windowSize = params.windowSize
        break
      }
      case "djFilter": {
        // Tone.Filter — type ve frequency runtime cutoff'a göre değişir.
        // cutoff=0 iken allpass (transparent), >0 lowpass, <0 highpass.
        const n = node as unknown as {
          frequency: { value: number }
          Q: { value: number }
          type: BiquadFilterType
        }
        if (typeof params.cutoff === "number") {
          n.frequency.value = djFilterFreq(params.cutoff)
          n.type =
            params.cutoff < 0
              ? "highpass"
              : params.cutoff > 0
                ? "lowpass"
                : "allpass"
        }
        if (typeof params.Q === "number") n.Q.value = params.Q
        break
      }
      case "autoPanner": {
        const n = node as unknown as {
          frequency: { value: number }
          depth: { value: number }
        }
        if (typeof params.frequency === "number")
          n.frequency.value = params.frequency
        if (typeof params.depth === "number") n.depth.value = params.depth
        break
      }
      case "frequencyShifter": {
        const n = node as unknown as { frequency: { value: number } }
        if (typeof params.frequency === "number")
          n.frequency.value = params.frequency
        break
      }
      case "vibrato": {
        const n = node as unknown as {
          frequency: { value: number }
          depth: { value: number }
        }
        if (typeof params.frequency === "number")
          n.frequency.value = params.frequency
        if (typeof params.depth === "number") n.depth.value = params.depth
        break
      }
      case "highpassFilter":
      case "lowpassFilter":
      case "bandpassFilter": {
        const n = node as unknown as {
          frequency: { value: number }
          Q: { value: number }
        }
        if (typeof params.frequency === "number")
          n.frequency.value = params.frequency
        if (typeof params.Q === "number") n.Q.value = params.Q
        // rolloff changes Tone.Filter discriminate internal IIR coeffs;
        // dispose+rebuild via shape diff. live setter yok.
        break
      }
      case "feedbackDelay": {
        const n = node as unknown as {
          delayTime: { value: number }
          feedback: { value: number }
        }
        if (typeof params.delayTime === "number")
          n.delayTime.value = params.delayTime
        if (typeof params.feedback === "number")
          n.feedback.value = params.feedback
        break
      }
      case "pumpingComp": {
        // Compressor + attached LFO. Threshold + ratio + attack + release
        // doğrudan compressor üstünde; rate + depth attached LFO üstünde.
        const comp = node as unknown as {
          threshold: { value: number }
          ratio: { value: number }
          attack: { value: number }
          release: { value: number }
          _pumpLfo?: Tone.LFO
        }
        if (typeof params.threshold === "number")
          comp.threshold.value = params.threshold
        if (typeof params.ratio === "number") comp.ratio.value = params.ratio
        if (typeof params.attack === "number")
          comp.attack.value = params.attack
        if (typeof params.release === "number")
          comp.release.value = params.release
        if (comp._pumpLfo) {
          if (typeof params.rate === "number")
            comp._pumpLfo.frequency.value = params.rate
          if (typeof params.depth === "number" || typeof params.threshold === "number") {
            const base = typeof params.threshold === "number"
              ? params.threshold
              : comp.threshold.value
            const depth = typeof params.depth === "number"
              ? params.depth
              : (() => {
                  // recover prior depth from LFO.max - LFO.min
                  const max = (comp._pumpLfo as unknown as { max: number }).max
                  const min = (comp._pumpLfo as unknown as { min: number }).min
                  return Math.max(0, max - min)
                })()
            ;(comp._pumpLfo as unknown as { min: number }).min = base
            ;(comp._pumpLfo as unknown as { max: number }).max = base + depth
          }
        }
        break
      }
      case "hallReverb": {
        // Tone.Reverb decay/preDelay live setter mevcut; decay regen IR
        // (async pop). preDelay sample-accurate.
        const n = node as unknown as {
          decay: number
          preDelay: number
        }
        if (typeof params.decay === "number") n.decay = params.decay
        if (typeof params.preDelay === "number") n.preDelay = params.preDelay
        break
      }
      case "stutterGate": {
        // Wrapped Gain + attached LFO. rate → LFO.frequency, depth → LFO.min
        // (1 - depth = floor; depth=1 → tam stutter, depth=0 → bypass).
        const gate = node as unknown as { _gateLfo?: Tone.LFO }
        if (gate._gateLfo) {
          if (typeof params.rate === "number")
            gate._gateLfo.frequency.value = params.rate
          if (typeof params.depth === "number") {
            const d = Math.max(0, Math.min(1, params.depth))
            ;(gate._gateLfo as unknown as { min: number }).min = 1 - d
            ;(gate._gateLfo as unknown as { max: number }).max = 1
          }
        }
        break
      }
      case "shimmerReverb": {
        const s = node as unknown as ShimmerReverb
        if (typeof params.pitch === "number") s.setPitch(params.pitch)
        if (typeof params.decay === "number") s.setDecay(params.decay)
        if (typeof params.feedback === "number")
          s.setFeedbackAmount(params.feedback)
        break
      }
      case "sidechainComp": {
        const s = node as unknown as SidechainComp
        if (typeof params.amount === "number") s.setAmount(params.amount)
        if (typeof params.release === "number") s.setRelease(params.release)
        if (typeof params.sourceTrackId === "string") {
          // Empty string → clear source; non-empty → lookup ve bind
          if (params.sourceTrackId === "") {
            s.setSidechainSource(null)
          } else {
            try {
              const g = getGraph()
              const src = g.tracks.get(params.sourceTrackId)
              s.setSidechainSource(src ? src.trackGain : null)
            } catch {}
          }
        }
        break
      }
      case "harmonizer": {
        const h = node as unknown as Harmonizer
        if (typeof params.voice1 === "number") h.setVoicePitch(1, params.voice1)
        if (typeof params.voice2 === "number") h.setVoicePitch(2, params.voice2)
        if (typeof params.voice3 === "number") h.setVoicePitch(3, params.voice3)
        if (typeof params.mix1 === "number") h.setVoiceMix(1, params.mix1)
        if (typeof params.mix2 === "number") h.setVoiceMix(2, params.mix2)
        if (typeof params.mix3 === "number") h.setVoiceMix(3, params.mix3)
        break
      }
      case "autoTune": {
        // Sadece state objesini güncelle — interval loop her tick'te
        // güncel key/scale/strength'i okur. PitchShift.windowSize live OK.
        const at = node as unknown as {
          windowSize: number
          _atState?: {
            key: number
            scale: "major" | "minor" | "chromatic"
            strength: number
          }
        }
        if (typeof params.windowSize === "number")
          at.windowSize = params.windowSize
        if (at._atState) {
          if (typeof params.key === "number") at._atState.key = params.key
          if (
            typeof params.scale === "string" &&
            (params.scale === "major" ||
              params.scale === "minor" ||
              params.scale === "chromatic")
          ) {
            at._atState.scale = params.scale
          }
          if (typeof params.strength === "number") {
            at._atState.strength = Math.max(0, Math.min(1, params.strength))
          }
        }
        break
      }
    }
  } catch (err) {
    console.warn("[musician] applyFxParams failed", type, err)
  }
}

// ─── Mic recording ───────────────────────────────────────────────────────

let micStream: MediaStream | null = null
let micRecorder: MediaRecorder | null = null
let micChunks: Blob[] = []
let micMimeType = ""

function pickMicMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/webm",
  ]
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c
    } catch {}
  }
  return ""
}

/**
 * Mic input recording — kullanıcı browser mic permission verir, sonra
 * MediaRecorder ile audio/webm (opus) kayda alınır. Tek aktif kayıt
 * (paralel kayıt yok). stop() blob döner; caller upload edip clip
 * oluşturur.
 */
export async function startMicRecording(deviceId?: string): Promise<void> {
  if (typeof window === "undefined") return
  if (micRecorder) throw new Error("Mic recording already in progress")
  // deviceId ideal constraint — aygıt kaybolmuşsa browser sessizce
  // varsayılana düşer (kayıt akışı kırılmaz).
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId } : true,
  })
  micChunks = []
  micMimeType = pickMicMimeType()
  micRecorder = new MediaRecorder(
    micStream,
    micMimeType ? { mimeType: micMimeType } : undefined,
  )
  micRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) micChunks.push(e.data)
  }
  micRecorder.start(1000)
}

export function isMicRecording(): boolean {
  return micRecorder?.state === "recording"
}

export interface MicRecordingResult {
  blob: Blob
  mimeType: string
  extension: string
}

export async function stopMicRecording(): Promise<MicRecordingResult | null> {
  if (!micRecorder || micRecorder.state === "inactive") return null
  return new Promise<MicRecordingResult | null>((resolve) => {
    const mr = micRecorder!
    mr.onstop = () => {
      const blob = new Blob(micChunks, {
        type: micMimeType || mr.mimeType || "audio/webm",
      })
      const mime = blob.type || "audio/webm"
      const extension = mime.includes("webm")
        ? "webm"
        : mime.includes("mp4")
          ? "mp4"
          : mime.includes("ogg")
            ? "ogg"
            : "bin"
      micStream?.getTracks().forEach((t) => t.stop())
      micStream = null
      micRecorder = null
      micChunks = []
      micMimeType = ""
      resolve({ blob, mimeType: mime, extension })
    }
    mr.stop()
  })
}

// ─── Clip load / schedule ────────────────────────────────────────────────

export interface ClipScheduleInput {
  clipId: string
  trackId: string
  url: string
  startTime: number
  duration: number
  offset: number
  gain: number
  fadeIn?: number
  fadeOut?: number
  /**
   * Per-clip volume automation noktaları (clip-relative). 2+ nokta varsa
   * `linearRampToValueAtTime` ile player.volume schedule edilir; yoksa
   * sabit `gain` kullanılır.
   */
  gainPoints?: Array<{ time: number; value: number }>
  /** Time-stretch (1 = normal, <1 yavaş, >1 hızlı, sample pitch de değişir). */
  playbackRate?: number
  /** Pitch shift (semitone, -24..+24). 0 = bypass. */
  pitchShift?: number
  /**
   * Reverse Reverb — clip'in audio buffer'ı tersine çevrilip Freeverb tail
   * eklenerek offline render edilir; player.buffer render edilmiş ile
   * değiştirilir. Render cache'lenir (url + decay + mix key'iyle).
   */
  reverseReverb?: {
    decay: number
    mix: number
  }
}

/**
 * Reverse Reverb render cache — key: `${url}::rr::${decay}::${mix}`.
 * Module-level Map; tab lifetime boyunca yaşar. URL aynı + params aynı →
 * cache hit, anlık. Miss → expensive render (~ N saniye, clip uzunluğu +
 * decay tail).
 */
const reverseReverbCache = new Map<string, AudioBuffer>()

/**
 * Bir clip'in buffer'ını ters çevir + Freeverb ile pre-process et.
 * Tone.Offline ile render edilir; sonuç AudioBuffer döner.
 *
 * Render duration = sourceBuffer.duration + decay (tail için extra zaman).
 * decay > sourceBuffer.duration ise reverb tail klips bitiminden sonra
 * devam eder; output buffer total uzunlukta render edilir.
 */
async function renderReverseReverbBuffer(
  sourceBuffer: AudioBuffer,
  decay: number,
  mix: number,
): Promise<AudioBuffer> {
  // 1. Reverse — channel data Float32Array'lerini kopya + flip
  const ctx = Tone.getContext().rawContext as BaseAudioContext
  const reversed = ctx.createBuffer(
    sourceBuffer.numberOfChannels,
    sourceBuffer.length,
    sourceBuffer.sampleRate,
  )
  for (let c = 0; c < sourceBuffer.numberOfChannels; c++) {
    const src = sourceBuffer.getChannelData(c)
    const dst = reversed.getChannelData(c)
    const len = src.length
    for (let i = 0; i < len; i++) dst[i] = src[len - 1 - i] ?? 0
  }

  // 2. Tone.Offline render: reversed player → Freeverb → destination
  const totalDuration = sourceBuffer.duration + Math.max(0.1, decay)
  const m = Math.max(0, Math.min(1, mix))
  const renderedToneBuf = await Tone.Offline(async () => {
    const player = new Tone.Player(reversed)
    const verb = new Tone.Freeverb({
      roomSize: Math.min(0.95, 0.6 + m * 0.3),
      dampening: 3000,
      wet: m,
    })
    player.connect(verb)
    verb.toDestination()
    player.start(0)
    await Tone.loaded()
  }, totalDuration)
  // Tone.Offline returns ToneAudioBuffer (web Tone v15) — get raw AudioBuffer
  return renderedToneBuf.get() as AudioBuffer
}

/**
 * Bir clip'i schedule eder — Player.sync() pattern:
 * Player Transport'a sync edilir, `player.start(transportTime)` çağrısı
 * Transport seconds == transportTime olduğunda otomatik tetiklenir.
 * Bu sayede Transport.loop=true iken Player her loop iteration'ında
 * otomatik yeniden başlar (manuel re-schedule gerekmez).
 *
 * Transport.pause/stop → Player otomatik pause/stop (sync ile).
 *
 * Resume davranışı (referenceTime):
 *   - referenceTime < startTime → future, normal sync
 *   - startTime ≤ referenceTime < startTime+duration → ortadan başla
 *     (sync time = referenceTime, offset += elapsed, duration -= elapsed)
 *   - referenceTime ≥ startTime+duration → past, schedule yok
 *
 * Aynı clipId varsa önce dispose + yeniden kurar.
 */
export async function scheduleClip(
  input: ClipScheduleInput,
  referenceTime?: number,
): Promise<void> {
  const track = ensureTrack(input.trackId)
  if (track.clips.has(input.clipId)) {
    disposeClip(track, input.clipId)
  }

  let effectiveStart = input.startTime
  let effectiveOffset = input.offset
  let effectiveDuration = input.duration
  if (typeof referenceTime === "number") {
    const clipEnd = input.startTime + input.duration
    if (referenceTime >= clipEnd) return
    if (referenceTime > input.startTime) {
      const elapsed = referenceTime - input.startTime
      effectiveStart = referenceTime
      effectiveOffset = input.offset + elapsed
      effectiveDuration = Math.max(0.05, input.duration - elapsed)
    }
  }

  const player = new Tone.Player({
    url: input.url,
    autostart: false,
    fadeIn: Math.max(0.005, input.fadeIn ?? 0.005),
    fadeOut: Math.max(0.005, input.fadeOut ?? 0.005),
  })
  // Time-stretch — playbackRate (1=normal, 0.5=yarı tempo, 2=double; sample
  // pitch de bu rate ile değişir — bu "time-stretch" değil "varispeed", ama
  // pratik DAW kullanımı için yeterli; pitchShift ayrı uygulanır).
  const rate =
    typeof input.playbackRate === "number" && input.playbackRate > 0
      ? input.playbackRate
      : 1
  if (rate !== 1) player.playbackRate = rate
  // Pitch shift — Tone.PitchShift player ile trackGain arasına; 0=bypass.
  const semitones =
    typeof input.pitchShift === "number" ? input.pitchShift : 0
  let pitchShiftNode: Tone.PitchShift | null = null
  if (semitones !== 0) {
    pitchShiftNode = new Tone.PitchShift({ pitch: semitones })
    player.connect(pitchShiftNode)
    pitchShiftNode.connect(track.trackGain)
  } else {
    player.connect(track.trackGain)
  }

  const envelopePoints = (input.gainPoints ?? [])
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
    .sort((a, b) => a.time - b.time)
  const useEnvelope = envelopePoints.length >= 2
  const initialGain = useEnvelope ? envelopePoints[0]!.value : input.gain
  player.volume.value = Tone.gainToDb(Math.max(0.001, initialGain))
  await Tone.loaded()

  // Reverse Reverb — original buffer'ı al, render et (cache'le), player'a
  // setBuffer. Tone.loaded() sonrasında original buffer artık player.buffer
  // içinde mevcut; render bittiğinde override edilir.
  if (input.reverseReverb) {
    const rr = input.reverseReverb
    const cacheKey = `${input.url}::rr::${rr.decay.toFixed(3)}::${rr.mix.toFixed(3)}`
    let rendered = reverseReverbCache.get(cacheKey)
    if (!rendered) {
      const orig = player.buffer.get() as AudioBuffer | undefined
      if (orig) {
        try {
          rendered = await renderReverseReverbBuffer(orig, rr.decay, rr.mix)
          reverseReverbCache.set(cacheKey, rendered)
          // Aggressive cache cap — 32 entry; en eski entry FIFO drop.
          if (reverseReverbCache.size > 32) {
            const firstKey = reverseReverbCache.keys().next().value
            if (firstKey) reverseReverbCache.delete(firstKey)
          }
        } catch (err) {
          console.warn("[musician] reverse-reverb render failed", err)
        }
      }
    }
    if (rendered) {
      try {
        player.buffer.set(rendered)
      } catch (err) {
        console.warn("[musician] reverse-reverb buffer set failed", err)
      }
    }
  }

  // Player.sync() — Transport time'a sync. Sonraki .start(transportTime,...)
  // çağrıları Transport.scheduleOnce gibi davranır AMA loop=true ise her
  // iteration'da yeniden tetiklenir (Tone.js'in built-in semantic'i).
  // Time-stretch ile birlikte: Player kendi rate'inde oynar (Tone otomatik
  // duration scale eder, biz schema duration'ını geçiyoruz).
  player.sync().start(effectiveStart, effectiveOffset, effectiveDuration)

  // Envelope için: Tone.Transport.schedule callback'i her loop'ta da
  // tetiklenir (scheduleRepeat değil, schedule absolute time'da; loop
  // sırasında Transport seconds geri sıçradığı için scheduled events
  // yeniden tetiklenir).
  let envelopeEventId: number | null = null
  if (useEnvelope) {
    envelopeEventId = Tone.Transport.schedule((time) => {
      try {
        player.volume.cancelScheduledValues(time)
        player.volume.setValueAtTime(
          Tone.gainToDb(Math.max(0.001, envelopePoints[0]!.value)),
          time,
        )
        for (let i = 1; i < envelopePoints.length; i++) {
          const point = envelopePoints[i]!
          const relTime = point.time - effectiveOffset
          if (relTime < 0) continue
          player.volume.linearRampToValueAtTime(
            Tone.gainToDb(Math.max(0.001, point.value)),
            time + relTime,
          )
        }
      } catch (err) {
        console.warn("[musician] envelope schedule failed", err)
      }
    }, effectiveStart)
  }

  track.clips.set(input.clipId, {
    clipId: input.clipId,
    player,
    eventId: envelopeEventId,
    pitchShiftNode,
  })
}

function disposeClip(track: TrackHandle, clipId: string): void {
  const c = track.clips.get(clipId)
  if (!c) return
  if (c.eventId !== null) {
    try {
      Tone.Transport.clear(c.eventId)
    } catch {}
  }
  try {
    c.player.stop()
    c.player.unsync()
    c.player.disconnect()
    c.player.dispose()
  } catch {}
  if (c.pitchShiftNode) {
    try {
      c.pitchShiftNode.disconnect()
      c.pitchShiftNode.dispose()
    } catch {}
  }
  track.clips.delete(clipId)
}

export function removeClip(trackId: string, clipId: string): void {
  if (typeof window === "undefined") return
  const t = getGraph().tracks.get(trackId)
  if (!t) return
  disposeClip(t, clipId)
}

/**
 * Tape Stop trigger — clip'in player playback rate'ini `durationSec`
 * süresinde 1'den 0.001'e exponential ramp eder; ardından player.stop()
 * çağrılır ve rate orijinal değerine (clip.playbackRate veya 1) restore
 * edilir. DJ klasik drop / vinyl spin-down efekti.
 *
 * Per-clip non-FX action — FX chain'de değil; kullanıcı clip context
 * menu'sünden tetikler. Tone.Player.playbackRate Tone.Param değil sayısal
 * number field; AudioBufferSourceNode.playbackRate AudioParam'ına proxy.
 * exponentialRampToValueAtTime native Web Audio param method'una iniyoruz.
 */
export function triggerTapeStop(
  trackId: string,
  clipId: string,
  durationSec: number,
  originalRate?: number,
): void {
  if (typeof window === "undefined") return
  const g = getGraph()
  const t = g.tracks.get(trackId)
  if (!t) return
  const c = t.clips.get(clipId)
  if (!c) return
  const dur = Math.max(0.05, Math.min(5, durationSec))
  const orig = typeof originalRate === "number" && originalRate > 0
    ? originalRate
    : (typeof c.player.playbackRate === "number" ? c.player.playbackRate : 1)
  try {
    const now = Tone.now()
    // Web Audio AudioBufferSourceNode.playbackRate erişimi: Tone.Player'da
    // alias yok; internal _source AudioBufferSourceNode'a giriyoruz.
    // Fallback: number set (sıçrama olur ama yine de durdurur).
    const rawSource = (c.player as unknown as {
      _source?: { playbackRate?: AudioParam }
    })._source
    if (rawSource?.playbackRate) {
      rawSource.playbackRate.cancelScheduledValues(now)
      rawSource.playbackRate.setValueAtTime(orig, now)
      rawSource.playbackRate.exponentialRampToValueAtTime(0.001, now + dur)
    } else {
      // Fallback: simple step rate (best-effort)
      c.player.playbackRate = 0.001
    }
    // Restore + stop after duration
    setTimeout(() => {
      try {
        c.player.stop()
        c.player.playbackRate = orig
      } catch {}
    }, dur * 1000 + 30)
  } catch (err) {
    console.warn("[musician] tape stop failed", err)
  }
}

// ─── Master transport ────────────────────────────────────────────────────

export async function transportPlay(): Promise<void> {
  await ensureAudioStarted()
  if (typeof window === "undefined") return
  // AudioContext suspended ise resume — bazı tarayıcılarda Tone.start()
  // sonrası bile context suspend kalabilir
  const raw = Tone.getContext().rawContext as AudioContext
  if (raw.state === "suspended") {
    try {
      await raw.resume()
    } catch {}
  }
  Tone.Transport.start()
}

/**
 * Pending Transport schedule'larını temizle ama POZİSYONU KORU. Resume
 * için: kullanıcı pause + seek yapmış olabilir, yeni play schedule'lar
 * için eski event'ler interfere etmesin diye cancel(0); ama transport
 * seconds aynı kalsın ki kaldığı yerden devam etsin.
 *
 * `transportStop()` ile karıştırmayın — stop seconds=0 yapar.
 */
export function transportClearSchedule(): void {
  if (typeof window === "undefined") return
  try {
    if (Tone.Transport.state !== "stopped") {
      Tone.Transport.pause()
    }
    Tone.Transport.cancel(0)
  } catch {}
}

/**
 * @deprecated transportClearSchedule() + handlePlay'in yeni resume davranışı
 * ile değiştirildi. Geriye dönük uyumluluk için bırakıldı; yeni kod
 * kullanmamalı.
 */
export function transportResetAll(): void {
  if (typeof window === "undefined") return
  try {
    Tone.Transport.stop()
    Tone.Transport.cancel(0)
    Tone.Transport.seconds = 0
  } catch {}
}

/**
 * @deprecated Player.sync() pattern (iter 7h) ile Tone.Transport.pause/stop
 * sync edilen Player'ları otomatik pause/stop eder. Bu fonksiyon iter 7c'de
 * eski Transport.schedule (non-sync) pattern için yazılmıştı; artık no-op.
 * Backward-compat için export edilmiş; çağrı yapma.
 */
export function silenceAllClips(): void {
  // No-op — sync pattern'inde gerekli değil.
}

export function transportPause(): void {
  if (typeof window === "undefined") return
  Tone.Transport.pause()
  // Player'lar sync edildiği için Transport.pause otomatik pause eder.
}

export function transportStop(): void {
  if (typeof window === "undefined") return
  // Sync edilen Player'lar Transport.stop ile otomatik durur ve sonraki
  // Transport.start'ta scheduled time'da yeniden tetiklenir. cancel(0)
  // çağırma — sync registrations'ı silmek istemiyoruz; handlePlay öncesi
  // transportClearSchedule + re-scheduleAll zaten yeni sync'ler kurar.
  Tone.Transport.stop()
  Tone.Transport.seconds = 0
}

export function transportSeek(seconds: number): void {
  if (typeof window === "undefined") return
  Tone.Transport.seconds = Math.max(0, seconds)
}

export function getTransportPosition(): number {
  if (typeof window === "undefined") return 0
  return Tone.Transport.seconds
}

export function getTransportState(): "started" | "stopped" | "paused" {
  if (typeof window === "undefined") return "stopped"
  return Tone.Transport.state
}

/**
 * Transport loop region — enabled olduğunda Tone.Transport `start`/`end`
 * arasında döner. `enabled=false` veya `start>=end` ise loop kapalı.
 *
 * Player'lar Transport.schedule callback ile başlatıldıkları için Transport
 * loop sırasında her döngüde callback yeniden tetiklenmez — bu yüzden
 * scheduleClip ile re-schedule yapan handlePlay loop sırasında çağrılır.
 * Pragma: loop hard reset = handlePlay tekrar çağırılması; yumuşak loop
 * için clip'lerin player.loop pattern'i gerekir (v2).
 */
export function setTransportLoop(
  region: { start: number; end: number; enabled: boolean } | null,
): void {
  if (typeof window === "undefined") return
  try {
    if (!region || !region.enabled || region.end <= region.start) {
      Tone.Transport.loop = false
      return
    }
    Tone.Transport.loopStart = Math.max(0, region.start)
    Tone.Transport.loopEnd = Math.max(region.start + 0.05, region.end)
    Tone.Transport.loop = true
  } catch (err) {
    console.warn("[musician] setTransportLoop failed", err)
  }
}

// ─── Master ──────────────────────────────────────────────────────────────

export function setMasterVolume(vol: number): void {
  if (typeof window === "undefined") return
  getGraph().masterGain.gain.rampTo(Math.max(0, Math.min(2, vol)), 0.05)
}

// ─── Metronome ────────────────────────────────────────────────────────────

interface MetronomeState {
  synth: Tone.MembraneSynth
  gain: Tone.Gain
  eventId: number
  beatsPerBar: number
}

let metronome: MetronomeState | null = null

/**
 * Metronome — Tone.Transport.scheduleRepeat ile her beat'te tetiklenir.
 * Sadece Transport çalarken ses çıkar (Tone.Transport.state === "started").
 * Downbeat (bar başı) yüksek pitch, sub-beats düşük pitch.
 *
 * `bpm` Tone.Transport.bpm.value değerini set eder (project bpm sync).
 * `beatsPerBar` time signature'ın payı (4/4 → 4).
 *
 * enabled=false → dispose + state null.
 */
export function setMetronome(opts: {
  enabled: boolean
  bpm: number
  beatsPerBar: number
  volumeDb?: number
}): void {
  if (typeof window === "undefined") return
  // Always-sync BPM (kullanıcı transport bpm'ini değiştirdiyse metronome
  // güncel olsun)
  try {
    Tone.Transport.bpm.value = Math.max(20, Math.min(300, opts.bpm))
  } catch {}

  if (!opts.enabled) {
    if (metronome) {
      try {
        Tone.Transport.clear(metronome.eventId)
        metronome.synth.disconnect()
        metronome.synth.dispose()
        metronome.gain.disconnect()
        metronome.gain.dispose()
      } catch {}
      metronome = null
    }
    return
  }

  // Beats per bar değiştiyse de re-create gerekir
  if (metronome && metronome.beatsPerBar === opts.beatsPerBar) {
    // Sadece volume güncelle (varsa)
    if (typeof opts.volumeDb === "number") {
      metronome.gain.gain.value = Tone.dbToGain(opts.volumeDb)
    }
    return
  }
  // Dispose existing if any
  if (metronome) {
    try {
      Tone.Transport.clear(metronome.eventId)
      metronome.synth.dispose()
      metronome.gain.dispose()
    } catch {}
    metronome = null
  }

  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 6,
    envelope: {
      attack: 0.001,
      decay: 0.05,
      sustain: 0,
      release: 0.05,
    },
  })
  const gain = new Tone.Gain(
    Tone.dbToGain(typeof opts.volumeDb === "number" ? opts.volumeDb : -12),
  ).toDestination()
  synth.connect(gain)

  let beatIdx = 0
  const beatsPerBar = Math.max(1, opts.beatsPerBar)
  const eventId = Tone.Transport.scheduleRepeat((time) => {
    // Downbeat (bar başı) C5, sub-beats C4
    const note = beatIdx === 0 ? "C5" : "C4"
    try {
      synth.triggerAttackRelease(note, "32n", time)
    } catch {}
    beatIdx = (beatIdx + 1) % beatsPerBar
  }, "4n")

  metronome = { synth, gain, eventId, beatsPerBar }
}

// ─── Render / export ─────────────────────────────────────────────────────

export interface RenderTrackInput {
  trackId: string
  muted: boolean
  volume: number
  pan: number
  clips: Array<{
    clipId: string
    url: string
    startTime: number
    duration: number
    offset: number
    gain: number
    fadeIn?: number
    fadeOut?: number
    /** Clip-relative volume envelope (2+ noktada lineer ramp). */
    gainPoints?: Array<{ time: number; value: number }>
    /** Time-stretch playback rate (1 = normal). */
    playbackRate?: number
    /** Pitch shift in semitones (-24..+24, 0 = bypass). */
    pitchShift?: number
  }>
  /** Volume automation points (time, value); points yoksa track.volume sabit. */
  volumeAutomation?: Array<{ time: number; value: number }>
  /** Offline render sırasında uygulanacak per-track FX chain. */
  effects?: FxChainConfig[]
}

export interface RenderProjectInput {
  masterVolume: number
  totalDurationSec: number
  tracks: RenderTrackInput[]
}

/**
 * Offline render — Tone.Offline ile timeline'ı faster-than-real-time
 * (genelde 5-10x) render eder. Tüm clip'leri schedule + transport start +
 * AudioBuffer sonucu döndürür. Caller `audioBufferToWavBlob` ile WAV
 * blob'a çevirir.
 *
 * Solo track'ler (track.soloed varsa) sadece o track'ler render edilir;
 * v1'de soloed flag UI'da var ama caller tracks listesini önceden filtre
 * etmeli (engine direk muted bilgisini kullanır).
 */
export async function renderProject(
  input: RenderProjectInput,
): Promise<AudioBuffer> {
  // Tone.Offline tip cast — Tone v15 internal type, AudioBuffer döner
  const buffer = (await Tone.Offline(async () => {
    const limiter = new Tone.Limiter(-0.5).toDestination()
    const masterGain = new Tone.Gain(
      Math.max(0, Math.min(2, input.masterVolume)),
    ).connect(limiter)
    const players: Tone.Player[] = []
    for (const track of input.tracks) {
      if (track.muted) continue
      const trackGain = new Tone.Gain(
        Math.max(0, Math.min(1, track.volume)),
      )
      const panner = new Tone.Panner(
        Math.max(-1, Math.min(1, track.pan)),
      )
      // FX chain — sadece enabled olanlar. Bypass varsa zincir kısalır.
      let cursor: Tone.ToneAudioNode = trackGain
      const fxNodes: Tone.ToneAudioNode[] = []
      for (const fx of track.effects ?? []) {
        if (!fx.enabled) continue
        const node = createFxNode(
          fx.type,
          Math.max(0, Math.min(1, fx.wet ?? 0.3)),
          fx.params,
        )
        if (!node) continue
        cursor.connect(node)
        cursor = node
        fxNodes.push(node)
      }
      cursor.connect(panner).connect(masterGain)
      void fxNodes
      // Volume automation — Tone.Param.linearRampToValueAtTime ile her
      // point'i schedule et. İlk değer initial setValueAtTime ile.
      if (track.volumeAutomation && track.volumeAutomation.length > 0) {
        for (const point of track.volumeAutomation) {
          const v = Math.max(0, Math.min(1, point.value))
          trackGain.gain.linearRampToValueAtTime(v, point.time)
        }
      }
      for (const clip of track.clips) {
        const player = new Tone.Player({
          url: clip.url,
          autostart: false,
          fadeIn: Math.max(0.005, clip.fadeIn ?? 0.005),
          fadeOut: Math.max(0.005, clip.fadeOut ?? 0.005),
        })
        // Time-stretch + pitch-shift offline render uygulaması
        const clipRate =
          typeof clip.playbackRate === "number" && clip.playbackRate > 0
            ? clip.playbackRate
            : 1
        if (clipRate !== 1) player.playbackRate = clipRate
        const clipSemitones =
          typeof clip.pitchShift === "number" ? clip.pitchShift : 0
        if (clipSemitones !== 0) {
          const ps = new Tone.PitchShift({ pitch: clipSemitones })
          player.connect(ps)
          ps.connect(trackGain)
        } else {
          player.connect(trackGain)
        }
        // Clip envelope — gainPoints var ise initial = first point's value
        const envelopePoints = (clip.gainPoints ?? [])
          .filter(
            (p) => Number.isFinite(p.time) && Number.isFinite(p.value),
          )
          .sort((a, b) => a.time - b.time)
        const useEnvelope = envelopePoints.length >= 2
        const initialGain = useEnvelope
          ? envelopePoints[0]!.value
          : clip.gain
        player.volume.value = Tone.gainToDb(Math.max(0.001, initialGain))
        players.push(player)
        Tone.getTransport().schedule((time) => {
          try {
            player.start(time, clip.offset, clip.duration)
            if (useEnvelope) {
              player.volume.cancelScheduledValues(time)
              player.volume.setValueAtTime(
                Tone.gainToDb(Math.max(0.001, envelopePoints[0]!.value)),
                time,
              )
              for (let i = 1; i < envelopePoints.length; i++) {
                const point = envelopePoints[i]!
                const relTime = point.time - clip.offset
                if (relTime < 0) continue
                player.volume.linearRampToValueAtTime(
                  Tone.gainToDb(Math.max(0.001, point.value)),
                  time + relTime,
                )
              }
            }
          } catch {}
        }, clip.startTime)
      }
    }
    await Tone.loaded()
    Tone.getTransport().start(0)
  }, input.totalDurationSec)) as unknown as AudioBuffer
  return buffer
}

/**
 * AudioBuffer → 16-bit PCM WAV blob. Single channel & stereo destekler.
 * Encoding: PCM signed 16-bit little-endian, RIFF header.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numSamples = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)

  // RIFF header
  writeString(view, 0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, "WAVE")
  // fmt chunk
  writeString(view, 12, "fmt ")
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  // data chunk
  writeString(view, 36, "data")
  view.setUint32(40, dataSize, true)

  // Interleaved samples
  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c]![i] ?? 0))
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, int16, true)
      offset += 2
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" })
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

// ─── SidechainComp — gerçek sidechain ducking (Tone.Effect subclass) ────

/**
 * SidechainComp — gerçek sidechain-style ducking. Pumping Comp'tan farklı
 * (o ghost variant — internal LFO ile threshold modulasyonu); bu source
 * track'in envelope'unu takip edip target track'in gain'ini düşürür.
 *
 * Signal flow:
 *   input (target) → send → duckGain → return → output
 *                                 ↑
 *                       Scale(1 → 1-amount)
 *                                 ↑
 *                       Tone.Follower (envelope)
 *                                 ↑
 *                       source track's trackGain (external)
 *
 * Kullanım: kick drum track → vokal track ducking. Source seçimi runtime'da
 * `setSidechainSource(srcNode)` ile yapılır; null = bypass (gain=1 sabit).
 *
 * Sample-accurate (Tone.Follower → Web Audio AudioParam connection); polling
 * yok. Threshold knob yerine "amount" knob — envelope'un ne kadar gain
 * azaltacağı (0 = bypass, 1 = full duck).
 */
interface SidechainCompOptions extends ToneEffectOptions {
  amount: number
  attack: number
  release: number
}

class SidechainComp extends ToneEffect<SidechainCompOptions> {
  readonly name = "SidechainComp"
  private _duckGain: Tone.Gain
  private _follower: Tone.Follower
  private _scale: Tone.Scale
  private _sourceNode: Tone.ToneAudioNode | null = null

  constructor(options: Partial<SidechainCompOptions> = {}) {
    super({
      ...ToneEffect.getDefaults(),
      amount: 0.7,
      attack: 0.005,
      release: 0.15,
      wet: 1,
      ...options,
    } as SidechainCompOptions)

    const amount = Math.max(0, Math.min(1, options.amount ?? 0.7))
    this._duckGain = new Tone.Gain(1)
    // Follower: source envelope detector
    this._follower = new Tone.Follower({
      smoothing: options.release ?? 0.15,
    })
    // Scale: 0..1 envelope → 1..(1-amount) gain (inverse)
    this._scale = new Tone.Scale(1, 1 - amount)
    this._follower.connect(this._scale)
    this._scale.connect(this._duckGain.gain)

    // Effect chain: send → duckGain → return
    this.effectSend.connect(this._duckGain)
    this._duckGain.connect(this.effectReturn)
  }

  /**
   * Source track'i sidechain bus'a bağla. null = disconnect (duckGain
   * gain=1 sabit — bypass). Source değiştiğinde eskiyi disconnect, yenisini
   * follower'a connect.
   */
  setSidechainSource(srcNode: Tone.ToneAudioNode | null): void {
    if (this._sourceNode === srcNode) return
    if (this._sourceNode) {
      try {
        this._sourceNode.disconnect(this._follower)
      } catch {}
    }
    this._sourceNode = srcNode
    if (srcNode) {
      try {
        srcNode.connect(this._follower)
      } catch {}
    }
  }

  setAmount(value: number): void {
    const v = Math.max(0, Math.min(1, value))
    // Scale.max canlı set; min sabit (1)
    this._scale.max = 1 - v
  }

  setRelease(seconds: number): void {
    this._follower.smoothing = Math.max(0.01, seconds)
  }

  dispose(): this {
    super.dispose()
    try {
      if (this._sourceNode) {
        this._sourceNode.disconnect(this._follower)
      }
      this._follower.dispose()
      this._scale.dispose()
      this._duckGain.dispose()
    } catch {}
    return this
  }
}

/**
 * SidechainComp instance'ına source track'i bağla. UI'dan
 * `setFxSidechainSource(targetTrackId, fxId, sourceTrackId | null)`
 * çağrılır. Source track silindiyse null geçilir.
 */
export function setFxSidechainSource(
  targetTrackId: string,
  fxId: string,
  sourceTrackId: string | null,
): void {
  if (typeof window === "undefined") return
  const g = getGraph()
  const target = g.tracks.get(targetTrackId)
  if (!target) return
  const slot = target.fxChain.find((s) => s.id === fxId)
  if (!slot || !slot.node) return
  if (!(slot.node instanceof SidechainComp)) return
  const source =
    sourceTrackId && sourceTrackId !== targetTrackId
      ? g.tracks.get(sourceTrackId)
      : null
  slot.node.setSidechainSource(source ? source.trackGain : null)
}

// ─── Composite custom FX nodes (Tone.Effect subclass) ───────────────────

/**
 * ShimmerReverb — Valhalla VintageVerb Shimmer / Eventide Blackhole tarzı
 * atmosferik FX.
 *
 * Signal flow:
 *   input → send → PitchShift(+12 oct) → Reverb (long decay) → return → output
 *                                              ↓
 *                                         feedback gain
 *                                              ↓
 *                                     PitchShift input (loop)
 *
 * Feedback loop sürekli +1 octave shift edip reverb tail'ine geri besler
 * → infinite rising shimmer cascade.
 *
 * Tone.Effect base class wet/dry CrossFade'i otomatik sağlar; alt sınıf
 * sadece internal node graph'ını `effectSend → ... → effectReturn` arasına
 * route eder.
 */
interface ShimmerReverbOptions extends ToneEffectOptions {
  pitch: number
  decay: number
  feedback: number
}

class ShimmerReverb extends ToneEffect<ShimmerReverbOptions> {
  readonly name = "ShimmerReverb"
  private _pitchShift: Tone.PitchShift
  private _reverb: Tone.Reverb
  private _feedback: Tone.Gain

  constructor(options: Partial<ShimmerReverbOptions> = {}) {
    super({
      ...ToneEffect.getDefaults(),
      pitch: 12,
      decay: 6,
      feedback: 0.45,
      wet: 0.5,
      ...options,
    } as ShimmerReverbOptions)

    this._pitchShift = new Tone.PitchShift({
      pitch: options.pitch ?? 12,
      windowSize: 0.1,
    })
    this._reverb = new Tone.Reverb({
      decay: options.decay ?? 6,
      preDelay: 0.01,
    })
    this._feedback = new Tone.Gain(
      Math.max(0, Math.min(0.9, options.feedback ?? 0.45)),
    )

    // Send → PitchShift → Reverb → Return chain
    this.effectSend.connect(this._pitchShift)
    this._pitchShift.connect(this._reverb)
    this._reverb.connect(this.effectReturn)
    // Feedback loop: Reverb out → feedback gain → PitchShift in
    // (her döngüde +12 semitone cascade)
    this._reverb.connect(this._feedback)
    this._feedback.connect(this._pitchShift)
  }

  setPitch(semitones: number): void {
    this._pitchShift.pitch = semitones
  }
  setDecay(seconds: number): void {
    this._reverb.decay = seconds
  }
  setFeedbackAmount(value: number): void {
    this._feedback.gain.rampTo(Math.max(0, Math.min(0.9, value)), 0.05)
  }

  dispose(): this {
    super.dispose()
    try {
      this._pitchShift.dispose()
      this._reverb.dispose()
      this._feedback.dispose()
    } catch {}
    return this
  }
}

/**
 * Harmonizer — Eventide H3000 tarzı 3-voice paralel pitch shifter.
 *
 * Signal flow:
 *   input → send → 3 paralel PitchShift voice'larına fan-out
 *                  her voice → kendi mix gain'i → fan-in (mixBus Gain)
 *                  mixBus → return → output
 *
 * Default: +4 (major 3rd), +7 (perfect 5th), +12 (octave) — clasik
 * choir voicing. Kullanıcı her voice için pitch (semitone) + mix (0..1)
 * ayarlayabilir.
 */
interface HarmonizerOptions extends ToneEffectOptions {
  voice1: number
  voice2: number
  voice3: number
  mix1: number
  mix2: number
  mix3: number
}

class Harmonizer extends ToneEffect<HarmonizerOptions> {
  readonly name = "Harmonizer"
  private _voice1: Tone.PitchShift
  private _voice2: Tone.PitchShift
  private _voice3: Tone.PitchShift
  private _mix1: Tone.Gain
  private _mix2: Tone.Gain
  private _mix3: Tone.Gain
  private _mixBus: Tone.Gain

  constructor(options: Partial<HarmonizerOptions> = {}) {
    super({
      ...ToneEffect.getDefaults(),
      voice1: 4,
      voice2: 7,
      voice3: 12,
      mix1: 0.6,
      mix2: 0.6,
      mix3: 0.4,
      wet: 0.5,
      ...options,
    } as HarmonizerOptions)

    this._voice1 = new Tone.PitchShift({
      pitch: options.voice1 ?? 4,
      windowSize: 0.08,
    })
    this._voice2 = new Tone.PitchShift({
      pitch: options.voice2 ?? 7,
      windowSize: 0.08,
    })
    this._voice3 = new Tone.PitchShift({
      pitch: options.voice3 ?? 12,
      windowSize: 0.08,
    })
    this._mix1 = new Tone.Gain(
      Math.max(0, Math.min(1, options.mix1 ?? 0.6)),
    )
    this._mix2 = new Tone.Gain(
      Math.max(0, Math.min(1, options.mix2 ?? 0.6)),
    )
    this._mix3 = new Tone.Gain(
      Math.max(0, Math.min(1, options.mix3 ?? 0.4)),
    )
    this._mixBus = new Tone.Gain(1)

    // Fan-out from send → 3 voices
    this.effectSend.connect(this._voice1)
    this.effectSend.connect(this._voice2)
    this.effectSend.connect(this._voice3)
    // Each voice → its mix gain → fan-in mixBus
    this._voice1.connect(this._mix1).connect(this._mixBus)
    this._voice2.connect(this._mix2).connect(this._mixBus)
    this._voice3.connect(this._mix3).connect(this._mixBus)
    // mixBus → return
    this._mixBus.connect(this.effectReturn)
  }

  setVoicePitch(idx: 1 | 2 | 3, semitones: number): void {
    const ps =
      idx === 1 ? this._voice1 : idx === 2 ? this._voice2 : this._voice3
    ps.pitch = semitones
  }
  setVoiceMix(idx: 1 | 2 | 3, level: number): void {
    const g = idx === 1 ? this._mix1 : idx === 2 ? this._mix2 : this._mix3
    g.gain.rampTo(Math.max(0, Math.min(1, level)), 0.05)
  }

  dispose(): this {
    super.dispose()
    try {
      this._voice1.dispose()
      this._voice2.dispose()
      this._voice3.dispose()
      this._mix1.dispose()
      this._mix2.dispose()
      this._mix3.dispose()
      this._mixBus.dispose()
    } catch {}
    return this
  }
}
