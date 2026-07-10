/**
 * Tiny client-only audio helper for "task done" feedback.
 *
 * - Creates a single <audio> element eagerly and reuses it for every call.
 * - "Unlock" pattern: browsers block HTMLMediaElement.play() until the
 *   element has been played once inside a user gesture. Background SSE
 *   events (Linear webhook → sync stream) carry NO user activation,
 *   so a freshly-created element silently fails there. We bless the element
 *   on the first pointer/keyboard gesture (muted play→pause) so later
 *   programmatic play() calls succeed even from background events and on
 *   inactive tabs. Call initSoundUnlock() once on app mount.
 * - Per-issue 5s cooldown so an optimistic local play + the webhook
 *   round-trip don't double-fire on the same completion.
 * - Respects the user's `soundEnabled` preference (ui-store).
 */

import { useUiStore } from "@/stores/ui-store"

const COOLDOWN_MS = 5_000
const SUCCESS_BELL_SRC = "/success-bell.mp3"
const DEFAULT_VOLUME = 0.55

let audioEl: HTMLAudioElement | null = null
let unlocked = false
let unlockBound = false
const lastPlayed = new Map<string, number>()

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null
  if (audioEl) return audioEl
  try {
    const el = new Audio(SUCCESS_BELL_SRC)
    el.preload = "auto"
    el.volume = DEFAULT_VOLUME
    audioEl = el
    return el
  } catch {
    return null
  }
}

/**
 * Bless the audio element on the first user gesture. Plays it muted then
 * immediately pauses/rewinds — inaudible, but flips the element into the
 * "user-activated" state so future play() calls aren't blocked by the
 * autoplay policy. Idempotent and self-removing.
 */
export function initSoundUnlock(): void {
  if (typeof window === "undefined" || unlockBound || unlocked) return
  unlockBound = true

  const unlock = () => {
    const el = getAudio()
    if (!el) {
      teardown()
      return
    }
    const prevMuted = el.muted
    el.muted = true
    const done = () => {
      try {
        el.pause()
        el.currentTime = 0
      } catch {
        // ignore
      }
      el.muted = prevMuted
      unlocked = true
      teardown()
    }
    try {
      const p = el.play()
      if (p && typeof p.then === "function") {
        p.then(done).catch(() => {
          // Gesture wasn't enough (rare). Listener'lar once:false ile bağlı
          // kaldığından bir sonraki jeste kendiliğinden yeniden dener;
          // unlockBound'u sıfırlama (çift-bind sızıntısı olur).
          el.muted = prevMuted
        })
      } else {
        done()
      }
    } catch {
      el.muted = prevMuted
    }
  }

  const events = ["pointerdown", "keydown", "touchstart"] as const
  const teardown = () => {
    for (const ev of events)
      window.removeEventListener(ev, unlock, { capture: true })
  }
  for (const ev of events)
    window.addEventListener(ev, unlock, { capture: true, once: false })
}

export function playSuccessBell(issueId?: string | null): void {
  if (typeof window === "undefined") return
  // Kullanıcı sesi kapattıysa hiç çalma.
  if (!useUiStore.getState().soundEnabled) return

  const el = getAudio()
  if (!el) return

  const key = issueId ?? "__global__"
  const now = Date.now()
  const prev = lastPlayed.get(key) ?? 0
  if (now - prev < COOLDOWN_MS) return
  lastPlayed.set(key, now)

  try {
    el.muted = false
    el.volume = DEFAULT_VOLUME
    el.currentTime = 0
    void el.play().catch(() => {
      // Autoplay blocked (element not yet unlocked, or tab policy).
      if (process.env.NODE_ENV === "development") {
        console.debug(
          "[sounds] success-bell play blocked — kullanıcı henüz sayfayla etkileşmedi mi?",
        )
      }
    })
  } catch {
    // ignore
  }
}
