export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { verifyInternalRequest } from "@workspace/console/lib/internal-auth"
import { authUserModel, scheduledMeetingModel } from "@workspace/db/models"
import { mailParticipants } from "@/lib/meet-schedule"
import { pushMeetNotification } from "@/lib/meet-push"

/**
 * T-15 hatırlatma sweep'i — periyodik bir zamanlayıcı (status-worker / cron)
 * `x-internal-secret` ile POST eder. Başlangıcına ≤15 dk kalan, hatırlatması
 * gönderilmemiş toplantıları bulur, katılımcılara "yakında başlıyor" maili
 * gönderir, idempotent olsun diye reminderSentAt'i işaretler.
 */
export async function POST(request: NextRequest) {
  const forbidden = verifyInternalRequest(request)
  if (forbidden) return forbidden

  const due = await scheduledMeetingModel.dueForReminder(15)
  let notified = 0
  for (const m of due) {
    // Toplantı-başına guard: tek bozuk kayıt sweep'in kalanını düşürmesin.
    try {
      await mailParticipants("meeting.reminder", m, {
        title: m.title,
        whenText: m.whenText,
        url: m.url,
      })
      // Mail'e EK: Sentroy hesabı olan katılımcılara (+ organizatöre) push +
      // OS bildirimi. BEST-EFFORT: mail gönderildikten sonraki HİÇBİR hata
      // markReminderSent'i engellememeli — aksi halde sonraki 2-dk sweep'i
      // aynı katılımcılara maili YENİDEN yollar (idempotency sözleşmesi).
      try {
        const ids = await authUserModel.findIdsByEmails(m.participants.map((p) => p.email))
        const userIds = [...new Set([...ids.values(), m.organizerUserId])]
        await pushMeetNotification({
          userIds,
          title: m.title,
          body: `Starting soon · ${m.whenText}`,
          room: m.room,
          companyId: m.companyId,
        })
      } catch (err) {
        console.warn(`[meet-reminders] push targeting failed for ${m.id}:`, (err as Error).message)
      }
      await scheduledMeetingModel.markReminderSent(m.id)
      notified++
    } catch (err) {
      console.warn(`[meet-reminders] meeting ${m.id} failed, continuing sweep:`, (err as Error).message)
    }
  }

  return jsonSuccess({ processed: notified })
}
