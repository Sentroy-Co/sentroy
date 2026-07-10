"use client"

import { ThemeProvider } from "@workspace/console/components/providers/theme-provider"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { Toaster } from "@workspace/ui/components/sonner"
import { ConfirmDialog } from "@workspace/console/components/shared/confirm-dialog"

export function UIProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Sentroy OS embed mode — app kendi header/sidebar chrome'unu gizler
          (globals.css `[data-embedded]`). Paint'ten önce çalışır (no-flash).
          Embed sinyali: (1) ?embed param, (2) IFRAME'DE OLMAK (core yalnız OS/
          app-store iframe'inde gömülür → chrome'suz olmalı), (3) sessionStorage
          STICKY (bir kez embed olunca aynı sekmede iframe'den çıksa da kalır —
          örn. youtube/instagram sekme değişimi). Önceden `f && sessionStorage`
          isteniyordu; OS bir route'u ?embed olmadan açtığında (örn. admin) flag
          seed'lenmemiş oluyor ve iframe'de olmasına rağmen sidebar sızıyordu. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var p=new URLSearchParams(window.location.search).has('embed');var f=window.self!==window.top;var s=sessionStorage.getItem('os-embed')==='1';if(p||f||s){sessionStorage.setItem('os-embed','1');document.documentElement.dataset.embedded='1'}}catch(e){}`,
        }}
      />
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider>
          {children}
          <Toaster />
          <ConfirmDialog />
        </TooltipProvider>
      </ThemeProvider>
    </>
  )
}
