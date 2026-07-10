import { ensureSystemMailSender } from "@/lib/ensure-system-mail-sender"

ensureSystemMailSender()

export { notifyIncidentUpdatePost as POST } from "@workspace/console/handlers/status-notify-trigger"
