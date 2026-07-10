"use client"

import { useEffect, useRef, useState } from "react"

export interface WaStatus {
  status: "disconnected" | "connecting" | "qr" | "connected"
  phoneNumber: string | null
  pushName: string | null
  hasQr: boolean
}

export interface WaReaction {
  emoji: string
  fromMe: boolean
  senderJid: string | null
}

export interface WaLinkPreview {
  url: string
  title: string | null
  description: string | null
  image: string | null
}

export interface WaMessage {
  id: string
  companyId: string
  chatJid: string
  waMessageId: string
  fromMe: boolean
  senderJid: string | null
  senderName: string | null
  type: string
  body: string
  status: string
  mediaId: string | null
  mimetype: string | null
  fileName: string | null
  thumbnail: string | null
  linkPreview: WaLinkPreview | null
  waveform: number[] | null
  reactions: WaReaction[]
  timestamp: string
}

export interface WaReactionEvent {
  chatJid: string
  waMessageId: string
  reactions: WaReaction[]
}

export interface WaStatusUpdate {
  chatJid: string | null
  waMessageId: string
  status: string
}

export interface WaMediaReady {
  chatJid: string
  waMessageId: string
  mediaId: string
  mimetype: string | null
  fileName: string | null
}

export interface WaStreamHandlers {
  onMessage: (e: WaMessageEvent) => void
  onStatusUpdate?: (e: WaStatusUpdate) => void
  onMediaReady?: (e: WaMediaReady) => void
  onContactUpdate?: (e: WaContactUpdate) => void
  onHistory?: (e: { appended: number }) => void
  onReaction?: (e: WaReactionEvent) => void
}

export interface WaContact {
  id: string
  jid: string
  phone: string | null
  name: string | null
  pushName: string | null
  customName: string | null
  isGroup: boolean
  avatarUrl: string | null
  archived: boolean
  pinned: boolean
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastMessageFromMe: boolean
  unreadCount: number
}

export interface WaContactUpdate {
  jid: string
  avatarUrl?: string | null
  name?: string | null
  pushName?: string | null
}

export interface WaMessageEvent {
  message: WaMessage
  contact: WaContact
}

/**
 * WhatsApp gateway SSE stream'ine bağlanır. `status` + `qr`'ı state olarak
 * döner, `message` event'lerini ref-stabil callback'e iletir. Native
 * EventSource HTTP hata kodlarında reconnect ETMEZ; bu yüzden manuel
 * backoff ile yeniden bağlanılır.
 */
export function useWhatsappStream(
  slug: string,
  sessionId: string | null,
  handlers: WaStreamHandlers,
): { status: WaStatus | null; qr: string | null; setStatus: (s: WaStatus) => void } {
  const [status, setStatus] = useState<WaStatus | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    // Seçili numara değişince state sıfırla (yeni oturumun durumu gelene dek).
    setStatus(null)
    setQr(null)
    if (!sessionId) return

    let es: EventSource | null = null
    let closed = false
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const delays = [2000, 5000, 10000, 20000, 30000]

    const open = () => {
      if (closed) return
      es = new EventSource(
        `/api/companies/${slug}/whatsapp/sessions/${sessionId}/events`,
      )

      es.addEventListener("status", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as WaStatus
          setStatus(data)
          if (data.status === "connected") setQr(null)
        } catch {
          /* ignore malformed */
        }
      })
      es.addEventListener("qr", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { qr: string }
          setQr(data.qr)
        } catch {
          /* ignore */
        }
      })
      es.addEventListener("message", (ev) => {
        try {
          handlersRef.current.onMessage(
            JSON.parse((ev as MessageEvent).data) as WaMessageEvent,
          )
        } catch {
          /* ignore */
        }
      })
      es.addEventListener("status-update", (ev) => {
        try {
          handlersRef.current.onStatusUpdate?.(
            JSON.parse((ev as MessageEvent).data) as WaStatusUpdate,
          )
        } catch {
          /* ignore */
        }
      })
      es.addEventListener("media-ready", (ev) => {
        try {
          handlersRef.current.onMediaReady?.(
            JSON.parse((ev as MessageEvent).data) as WaMediaReady,
          )
        } catch {
          /* ignore */
        }
      })
      es.addEventListener("contact-update", (ev) => {
        try {
          handlersRef.current.onContactUpdate?.(
            JSON.parse((ev as MessageEvent).data) as WaContactUpdate,
          )
        } catch {
          /* ignore */
        }
      })
      es.addEventListener("history", (ev) => {
        try {
          handlersRef.current.onHistory?.(
            JSON.parse((ev as MessageEvent).data) as { appended: number },
          )
        } catch {
          /* ignore */
        }
      })
      es.addEventListener("reaction", (ev) => {
        try {
          handlersRef.current.onReaction?.(
            JSON.parse((ev as MessageEvent).data) as WaReactionEvent,
          )
        } catch {
          /* ignore */
        }
      })

      es.onopen = () => {
        retry = 0
      }
      es.onerror = () => {
        es?.close()
        if (closed) return
        const delay = delays[Math.min(retry, delays.length - 1)]!
        retry++
        timer = setTimeout(open, delay)
      }
    }

    open()
    return () => {
      closed = true
      if (timer) clearTimeout(timer)
      es?.close()
    }
  }, [slug, sessionId])

  return { status, qr, setStatus }
}

export interface WaSessionInfo {
  sessionId: string
  label: string | null
  status: WaStatus["status"]
  phoneNumber: string | null
  pushName: string | null
}

export interface WaSearchResult {
  waMessageId: string
  chatJid: string
  body: string
  fromMe: boolean
  type: string
  timestamp: string
  chatName: string
}
