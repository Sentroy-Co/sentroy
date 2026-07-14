import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { vapidPublicKey } from "@/lib/push"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * VAPID public key — client `pushManager.subscribe` için applicationServerKey.
 * Public key SECRET DEĞİL (adı üstünde); auth gerektirmez. Null dönerse push
 * bu ortamda yapılandırılmamış → client toggle'ı "desteklenmiyor" gösterir.
 */
export async function GET() {
  return jsonSuccess({ publicKey: vapidPublicKey() })
}
