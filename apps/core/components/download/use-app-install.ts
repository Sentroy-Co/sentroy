"use client"

import { useCallback, useEffect, useState } from "react"
import type { DownloadPlatform } from "@/lib/desktop-downloads"

export type DetectedOs = DownloadPlatform | "mobile" | "other"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export interface AppInstallState {
  ready: boolean
  os: DetectedOs
  /** Sentroy masaüstü (Electron) kabuğunda mıyız → promo gösterme. */
  isElectron: boolean
  isMobile: boolean
  /** Zaten PWA olarak (standalone) yüklü çalışıyor mu → promo gösterme. */
  isStandalone: boolean
  /** Mobilde PWA install prompt'u yakalandı mı ("app gibi yükle" mümkün). */
  canInstallPwa: boolean
  installPwa: () => Promise<void>
}

// Modül-seviye: beforeinstallprompt hook mount'tan ÖNCE de gelebilir; global
// tut ki install butonu her zaman kullanabilsin.
let deferredPrompt: BeforeInstallPromptEvent | null = null

export function useAppInstall(): AppInstallState {
  const [ready, setReady] = useState(false)
  const [os, setOs] = useState<DetectedOs>("other")
  const [isElectron, setIsElectron] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [canInstallPwa, setCanInstallPwa] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const electron =
      Boolean((window as { sentroyDesktop?: unknown }).sentroyDesktop) ||
      /electron/i.test(ua)
    // iPadOS 13+ "macintosh" der ama touch var → mobil say.
    const iOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.maxTouchPoints > 1 && /macintosh/i.test(ua))
    const mobile = iOS || /android|mobile/i.test(ua)
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (window.navigator as { standalone?: boolean }).standalone === true

    let detected: DetectedOs = "other"
    if (mobile) detected = "mobile"
    else if (/mac/i.test(ua)) detected = "mac"
    else if (/win/i.test(ua)) detected = "win"
    else if (/linux/i.test(ua)) detected = "linux"

    setOs(detected)
    setIsElectron(electron)
    setIsMobile(mobile)
    setIsStandalone(standalone)
    if (deferredPrompt && mobile) setCanInstallPwa(true)
    setReady(true)

    const onBeforeInstall = (e: Event) => {
      // Tarayıcının kendi PWA install çubuğunu her yerde bastır. Masaüstünde
      // kullanıcıyı native uygulamaya yönlendiriyoruz; mobilde prompt'u saklayıp
      // kendi "app olarak yükle" butonumuzla tetikliyoruz.
      e.preventDefault()
      deferredPrompt = e as BeforeInstallPromptEvent
      if (mobile) setCanInstallPwa(true)
    }
    const onInstalled = () => {
      deferredPrompt = null
      setCanInstallPwa(false)
      setIsStandalone(true)
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const installPwa = useCallback(async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } catch {
      /* kullanıcı iptal etti / desteklenmiyor */
    }
    deferredPrompt = null
    setCanInstallPwa(false)
  }, [])

  return { ready, os, isElectron, isMobile, isStandalone, canInstallPwa, installPwa }
}
