"use client"

import { useCallback, useEffect } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Speaker01Icon, Mic01Icon } from "@hugeicons/core-free-icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import { useAudioDevices } from "@/lib/audio-devices"
import {
  isMasterOutputRoutingSupported,
  setMasterOutputDevice,
  reconcileTrackOutputs,
} from "@/lib/musician-engine"
import { Tip } from "./tip-button"

/**
 * Master strip'teki ses aygıtı popover'ı — Output/Input seçimi (karaoke
 * senaryosunun master yarısı).
 *
 * - Output: `AudioContext.setSinkId` (Chrome/Edge). Desteklenmeyen
 *   tarayıcıda Select disabled + "Not supported in this browser" notu.
 * - Input: mic kayıt yolundaki getUserMedia'ya deviceId constraint'i
 *   (seçim localStorage'da persist; her tarayıcıda çalışır).
 * - İzin akışı: etiketler görünmüyorsa "Allow device access" ile kısa bir
 *   getUserMedia izni istenir, liste yeniden yüklenir.
 * - devicechange dinlenir: master çıkışı veya track route'larının aygıtı
 *   kaybolursa güvenli fallback (default/master) + toast.
 *
 * Kural gereği SelectValue KULLANILMAZ — trigger etiketi manuel render.
 */
export function AudioDevicePopover({
  onTrackRoutesDropped,
}: {
  /** devicechange sonrası master'a geri düşen track id'leri — editor UI
   *  state'ini (kebab menü seçimi) günceller. */
  onTrackRoutesDropped(trackIds: string[]): void
}) {
  const {
    loaded,
    labelsVisible,
    inputs,
    outputs,
    outputId,
    inputId,
    refresh,
    setOutputId,
    setInputId,
  } = useAudioDevices()
  const masterSupported = isMasterOutputRoutingSupported()

  // İlk yükleme — persist edilen seçimleri hydrate et + izin İSTEMEDEN
  // mevcut listeyi al. Kalıcı output seçimi varsa sink'e uygula (reload
  // sonrası devam etsin); aygıt yoksa sessizce default'a dön.
  useEffect(() => {
    const st = useAudioDevices.getState()
    st.hydrate()
    void st.refresh(false)
    const persisted = useAudioDevices.getState().outputId
    if (persisted && isMasterOutputRoutingSupported()) {
      void setMasterOutputDevice(persisted).catch(() => {
        useAudioDevices.getState().setOutputId("")
      })
    }
  }, [])

  // Aygıt tak/çıkar — listeyi tazele + kopan route'ları güvenli düşür
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null
    if (!md?.addEventListener) return
    const handler = async () => {
      await refresh(false)
      const { outputs: freshOutputs, outputId: currentOut } =
        useAudioDevices.getState()
      const available = new Set(freshOutputs.map((o) => o.deviceId))
      // Master fallback
      if (currentOut && !available.has(currentOut)) {
        setOutputId("")
        try {
          await setMasterOutputDevice("")
        } catch {}
        toast.warning("Output device disconnected — master back to default")
      }
      // Track route fallback'leri
      try {
        const dropped = await reconcileTrackOutputs(available)
        if (dropped.length > 0) {
          onTrackRoutesDropped(dropped)
          toast.warning(
            `${dropped.length} track output${dropped.length === 1 ? "" : "s"} disconnected — routed back to Master`
          )
        }
      } catch {}
    }
    md.addEventListener("devicechange", handler)
    return () => md.removeEventListener("devicechange", handler)
  }, [refresh, setOutputId, onTrackRoutesDropped])

  const handleOutputChange = useCallback(
    async (id: string) => {
      const next = id === "__default__" ? "" : id
      try {
        await setMasterOutputDevice(next)
        setOutputId(next)
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not switch output device"
        )
      }
    },
    [setOutputId]
  )

  const outputLabel =
    outputs.find((o) => o.deviceId === outputId)?.label ?? "System default"
  const inputLabel =
    inputs.find((i) => i.deviceId === inputId)?.label ?? "System default"
  const routedOutput = masterSupported && !!outputId

  return (
    <Popover>
      <Tip text="Audio devices — output / input">
        <PopoverTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded transition",
                routedOutput
                  ? "bg-sky-500/20 text-sky-300"
                  : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              )}
            />
          }
        >
          <HugeiconsIcon icon={Speaker01Icon} size={13} />
        </PopoverTrigger>
      </Tip>
      <PopoverContent className="w-72 p-3" align="center" side="top">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          Audio devices
        </div>

        {/* İzin akışı — etiketler gizliyse tek tıkla izin iste */}
        {loaded && !labelsVisible && (
          <button
            type="button"
            onClick={() => void refresh(true)}
            className="mb-3 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 transition hover:bg-neutral-800"
          >
            Allow device access to list devices
          </button>
        )}

        {/* Output — feature-detect: desteklenmiyorsa disabled + not */}
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          <HugeiconsIcon icon={Speaker01Icon} size={11} />
          Output
        </div>
        {masterSupported ? (
          <Select
            value={outputId || "__default__"}
            onValueChange={(v) => {
              if (v) void handleOutputChange(v)
            }}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <span className="truncate">{outputLabel}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">System default</SelectItem>
              {outputs.map((o) => (
                <SelectItem key={o.deviceId} value={o.deviceId}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="rounded border border-dashed border-neutral-800 px-2 py-1.5 text-[10px] text-neutral-500">
            Output routing not supported in this browser
          </div>
        )}

        {/* Input — mic kayıt yolu; her tarayıcıda çalışır */}
        <div className="mt-3 mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          <HugeiconsIcon icon={Mic01Icon} size={11} />
          Input
        </div>
        <Select
          value={inputId || "__default__"}
          onValueChange={(v) => {
            if (v) setInputId(v === "__default__" ? "" : v)
          }}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <span className="truncate">{inputLabel}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">System default</SelectItem>
            {inputs.map((i) => (
              <SelectItem key={i.deviceId} value={i.deviceId}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mt-2 text-[9px] leading-snug text-neutral-600">
          Input applies to the next mic recording. Per-track outputs are in
          each track&apos;s menu — alternate outputs may add slight latency.
        </div>
      </PopoverContent>
    </Popover>
  )
}
