import {
  listInvitationsHandler,
  createInvitationHandler,
} from "@workspace/console/handlers/company-invitations"
import { ensureSystemMailSender } from "@/lib/ensure-system-mail-sender"

// Module load anında sender registry'yi garanti et — bkz.
// `lib/ensure-system-mail-sender.ts` jsdoc.
ensureSystemMailSender()

export const GET = listInvitationsHandler
export const POST = createInvitationHandler
