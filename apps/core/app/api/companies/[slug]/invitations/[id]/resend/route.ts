import { resendInvitationHandler } from "@workspace/console/handlers/company-invitations"
import { ensureSystemMailSender } from "@/lib/ensure-system-mail-sender"

// Module load anında sender registry'yi garanti et — instrumentation hook'u
// bazı runtime'larda route load'undan önce tetiklenmemiş olabilir, bu
// no-op idempotent register fallback.
ensureSystemMailSender()

export const POST = resendInvitationHandler
