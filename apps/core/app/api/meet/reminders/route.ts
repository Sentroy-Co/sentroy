export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { verifyInternalRequest } from "@workspace/console/lib/internal-auth"
import { scheduledMeetingModel } from "@workspace/db/models"
import { mailParticipants } from "@/lib/meet-schedule"

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
    await mailParticipants("meeting.reminder", m, {
      title: m.title,
      whenText: m.whenText,
      url: m.url,
    })
    await scheduledMeetingModel.markReminderSent(m.id)
    notified++
  }

  return jsonSuccess({ processed: notified })
}
