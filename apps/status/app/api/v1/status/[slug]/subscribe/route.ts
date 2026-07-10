// Defensive guard — instrumentation hook'u her runtime'da garanti olmasa da
// bu module-level import sender + resolver'ı set'ler (idempotent).
import { ensureSystemMailSender } from "@/lib/ensure-system-mail-sender"

ensureSystemMailSender()

export {
  subscribePost as POST,
  subscribeOptions as OPTIONS,
} from "@workspace/console/handlers/status-subscribers-public"
