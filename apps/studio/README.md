# Sentroy Studio

> Browser-native DJ + DAW. Tone.js engine, Web Audio scheduling, real-time FX rack.
> `studio.sentroy.com` · port `3006` · Next.js 16 · React 19

---

## What it is

Two editors under one roof, sharing the same audio context but isolated signal graphs:

| Mode         | Persona              | What you do                                                      |
| ------------ | -------------------- | ---------------------------------------------------------------- |
| **DJ**       | Performer / set-mix  | Pioneer-style decks, crossfader, hot-cues, beat-aware automix    |
| **Musician** | Producer / multitrack | FL/Studio One-style timeline: tracks, clips, FX chain, automation |

The same browser tab can switch between both per project (`StudioProject.mode`). Recording, master limiter, and export pipeline are shared; the rest is mode-specific.

---

## Quick start

```bash
# from monorepo root
bun install
bun run dev --filter=studio        # http://localhost:3006

bun run build --filter=studio
bun run typecheck --filter=studio
```

The dev server runs on **HTTPS** (`--experimental-https`) because `getUserMedia` (mic recording) needs a secure context outside of `localhost`.

---

## Stack

```
Audio        Tone.js v15 + Web Audio API
             - Transport.sync clip scheduling (loop-aware)
             - PitchShift / Reverb / Compressor / Follower primitives
             - Tone.Offline for export render
             - Custom Tone.Effect subclasses (Shimmer, Harmonizer,
               Sidechain — see `lib/musician-engine.ts`)

UI           Next.js 16 (Turbopack) + React 19
             - shadcn/ui primitives across the whole editor
             - dnd-kit for sortable track lists + FX chain
             - WaveSurfer-style bar matrix for clip waveforms
             - Custom ProKnob / ProSlider / VuMeter SVG controls
             - Orbitron LCD readouts for transport time + BPM

State        Zustand stores (DJ) + local React state (Musician)
             Optimistic patch + autosave debounce (revision counter
             for conflict detection)

Encoders     WAV (custom RIFF) · MP3 (@breezystack/lamejs) ·
             M4A (mp4-muxer + WebCodecs)

Persistence  MongoDB (studio_projects, studio_project_data,
             studio_fx_presets)
```

---

## Project layout

```
app/                                Next.js App Router
  [lang]/d/[company-slug]/studio    Project list
  [lang]/p/[projectId]              Editor (DJ or Musician)
  api/companies/[slug]/studio/...   CRUD + presets + assets

components/
  editor/                           DJ mode
    dj-editor.tsx                   Crossfader + 2..N decks
    pioneer/cdj-deck.tsx            CDJ-style deck (jog, hotcues)
    crossfader-panel.tsx            DJM-style crossfader
    auto-mix-panel.tsx              Beat-aware transition planner
    library-sidebar.tsx             Sample browser
    recording-controls.tsx          Master-out recorder
  musician/                         Musician mode
    musician-editor.tsx             Timeline + transport + tracks
    inspector-panel.tsx             Multi-tab inspector (right pane)
    inspector-tabs/
      fx-chain-content.tsx          FX rack (dnd-kit reorder)
      clip-trim-content.tsx         Source-window trimmer
      spectrum-content.tsx          FFT + oscilloscope
    header/header-bits.tsx          Hamburger / BPM LCD / saved dot
    controls/                       ProKnob / ProSlider / VuMeter
    clip-automation-overlay.tsx     Per-clip volume envelope

lib/
  audio-engine.ts                   DJ signal graph
  musician-engine.ts                Musician signal graph + FX nodes
  bpm-analyze.ts                    Web-worker BPM detection
  audio-encoders.ts                 WAV / MP3 / M4A encoders
  dj-store.ts / dj-actions.ts       Zustand
```

---

## FX rack (musician mode)

**30 standard FX**, **5 preset bundles**, all live-routable with sample-accurate parameter automation.

```
Dynamics            Compressor · Multi-Comp · Limiter · Pumping Comp · Sidechain Comp
EQ & Filter         EQ3 · HPF · LPF · BPF · DJ Filter
Time-based          Echo · Reverb · Hall Reverb · Feedback Delay · Shimmer Reverb
Modulation          Chorus · Phaser · Tremolo · Vibrato · Auto-Wah · AutoPanner ·
                    Filter Sweep · Pitch Shift · Freq Shift · Auto-Tune Lite · Harmonizer
Distortion          Distortion · BitCrush · Stutter Gate
Spatial             Stereo Widener
```

Presets (one-click multi-FX bundles):
**Lo-Fi Vinyl** · **80s Tape** · **Ambient Pad** · **Trap Hi-Hat** · **Vocal Air**

### Composite FX architecture

The custom DSP nodes (Shimmer, Harmonizer, Sidechain) are `Tone.Effect` subclasses. Tone v15 doesn't re-export `Effect` from its public `effect/index`, so the engine imports it directly:

```ts
import {
  Effect as ToneEffect,
  type EffectOptions as ToneEffectOptions,
} from "tone/build/esm/effect/Effect.js"
```

This gives you `effectSend` / `effectReturn` Gain rails, an automatic `wet` Signal hooked to a CrossFade output, and a clean `dispose()` chain. The pattern:

```ts
class MyEffect extends ToneEffect<MyOptions> {
  readonly name = "MyEffect"
  private _node: Tone.SomeNode
  constructor(options: Partial<MyOptions> = {}) {
    super({ ...ToneEffect.getDefaults(), wet: 0.5, ...options } as MyOptions)
    this._node = new Tone.SomeNode(...)
    this.effectSend.connect(this._node).connect(this.effectReturn)
  }
  dispose(): this {
    super.dispose()
    this._node.dispose()
    return this
  }
}
```

### Per-clip transient actions

Not every audio effect fits the FX-chain paradigm. Tape Stop is a one-shot:

```ts
triggerTapeStop(trackId, clipId, durationSec)
// → exponentialRampToValueAtTime on the player's _source.playbackRate,
//   then auto-stop + restore original rate after `durationSec`.
```

These live as items in the clip context menu rather than as FX-chain slots.

---

## Signal flow

```
clip player ─┐
clip player ─┼─→ trackGain ─→ FX₁ ─→ FX₂ ─→ … ─→ FXₙ ─→ panner ─→ masterGain ─→ limiter ─→ destination
clip player ─┘                                                                              │
                                                                                            ├─→ masterMeter
                                                                                            ├─→ masterFFT      (spectrum tab)
                                                                                            └─→ masterWaveform (oscilloscope tab)
```

FX chain is **serial** — each effect consumes the prior node's full output (dry+wet mixed), applies its own dry/wet, forwards. Drag-reorder via dnd-kit updates the DB schema; the engine's `setTrackFxChain` does shape-diff incremental rebuild (no click/pop on simple param tweaks, full rebuild only on chain shape change).

---

## Project shape

DJ and Musician projects share the same wrapper but discriminate by `tree.mode`:

```ts
type StudioProjectTree = StudioDjProjectTree | StudioMusicianProjectTree
```

See [`@workspace/db/models/studio-project-data`](../../packages/db/src/models/studio-project-data.ts) for the full schema.

Save model: 3-second autosave debounce, optimistic-locked by `revision` counter. Conflicts return 409 → editor re-loads.

---

## Deploy

```bash
# from monorepo root
./version.sh release patch --deploy --apps studio
```

This bumps `package.json`, builds locally, pushes to GHCR (`ghcr.io/sentroy-co/sentroy-studio:vX.Y.Z`), and triggers Coolify to pull. Build does **not** run on the production server.

See [`../../README.md`](../../README.md) §release-toolkit for the full pipeline.

---

## Conventions

- **English-only user-facing text.** Internal code comments may be Turkish; labels, toasts, tooltips, placeholders, and status lines are English.
- **No `title=` props for tooltips.** Wrap with shadcn `<Tooltip>` instead — browser-native title is inconsistent across platforms.
- **shadcn `<Select>`: never `<SelectValue>`** when the value is a slug/enum/id. Render the human label manually in the trigger. See [`SentroyCDN/README.md` §5.1](../../../README.md).
- **Color sources of truth:** track color from `track.color`; FX accent from `FX_LIBRARY[type].accent`; status colors from the SavedDot meta table.

---

## Roadmap

Shipped recently:
- 30 FX + 5 preset bundles + Auto-Tune Lite (FFT pitch detect)
- Composite Tone.Effect subclass pattern (Shimmer / Harmonizer / Sidechain)
- Tape Stop per-clip action
- dnd-kit FX chain reorder + AddFx 2-column sidebar dropdown
- Orbitron LCD digital readouts

Backlog (v2):
- Reverse Reverb — offline reverse buffer + Freeverb render
- Convolution Reverb — IR sample bank UI + Tone.Convolver
- Vocoder / Talkbox — formant filter bank + carrier synth
- musician-editor.tsx remaining `title=` → Tooltip migration (TipButton helper)

---

## License

Internal to Sentroy. Not for redistribution.
