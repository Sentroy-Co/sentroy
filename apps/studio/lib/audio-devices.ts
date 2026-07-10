"use client"

import { create } from "zustand"

/**
 * Ses giriş/çıkış aygıtları store'u — enumerateDevices + kalıcı seçim.
 *
 * İzin akışı: tarayıcı, mic izni verilmeden aygıt etiketlerini gizler
 * (boş label'lı liste). `refresh(true)` önce kısa bir getUserMedia ile izin
 * ister, stream'i hemen kapatır, sonra yeniden enumerate eder.
 *
 * Seçimler localStorage'da persist edilir (aygıt id'leri makineye özgü —
 * sunucu tree'sine yazmak anlamsız olurdu). Uygulama (sink apply, track
 * route) UI katmanında yapılır; bu store yalnız liste + seçim taşır.
 */

export interface AudioDeviceOption {
  deviceId: string
  label: string
}

const OUTPUT_KEY = "studio-audio-output"
const INPUT_KEY = "studio-audio-input"

function readPersisted(key: string): string {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}

function persist(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {}
}

interface AudioDevicesState {
  /** enumerateDevices en az bir kez çalıştı mı. */
  loaded: boolean
  /** Etiketler görünür mü (izin verilmiş) — değilse "Allow access" akışı. */
  labelsVisible: boolean
  inputs: AudioDeviceOption[]
  outputs: AudioDeviceOption[]
  /** "" = sistem varsayılanı. */
  outputId: string
  inputId: string

  /** localStorage'daki kalıcı seçimleri yükle — SSR hydration mismatch
   *  olmasın diye initial state boş, client mount'ta çağrılır. */
  hydrate(): void
  refresh(askPermission?: boolean): Promise<void>
  setOutputId(id: string): void
  setInputId(id: string): void
}

export const useAudioDevices = create<AudioDevicesState>((set) => ({
  loaded: false,
  labelsVisible: false,
  inputs: [],
  outputs: [],
  outputId: "",
  inputId: "",

  hydrate() {
    set({
      outputId: readPersisted(OUTPUT_KEY),
      inputId: readPersisted(INPUT_KEY),
    })
  },

  async refresh(askPermission = false) {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      set({ loaded: true })
      return
    }
    try {
      let devices = await navigator.mediaDevices.enumerateDevices()
      const unlabeled =
        devices.length === 0 || devices.every((d) => !d.label)
      if (unlabeled && askPermission && navigator.mediaDevices.getUserMedia) {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true })
          s.getTracks().forEach((t) => t.stop())
          devices = await navigator.mediaDevices.enumerateDevices()
        } catch {
          // İzin reddedildi — etiketsiz listeyle devam (default'lar çalışır)
        }
      }
      const toOption = (d: MediaDeviceInfo, i: number): AudioDeviceOption => ({
        deviceId: d.deviceId,
        label: d.label || `Device ${i + 1}`,
      })
      const inputs = devices
        .filter((d) => d.kind === "audioinput" && d.deviceId)
        .map(toOption)
      const outputs = devices
        .filter((d) => d.kind === "audiooutput" && d.deviceId)
        .map(toOption)
      set({
        inputs,
        outputs,
        loaded: true,
        labelsVisible: devices.some((d) => !!d.label),
      })
    } catch {
      set({ loaded: true })
    }
  },

  setOutputId(id) {
    persist(OUTPUT_KEY, id)
    set({ outputId: id })
  },

  setInputId(id) {
    persist(INPUT_KEY, id)
    set({ inputId: id })
  },
}))
