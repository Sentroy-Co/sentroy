/**
 * apps/backup-worker'a server-to-server çağrı (x-internal-secret). Worker
 * mongodump/mongorestore çalıştırır + S3 artefaktlarını tutar; tarayıcı asla
 * doğrudan erişmez. S3 kredensiyalleri YALNIZ worker'da — app indirmeyi worker
 * /file üzerinden proxy'ler.
 */

const WORKER_URL = (
  process.env.BACKUP_WORKER_URL ||
  process.env.NEXT_PUBLIC_BACKUP_WORKER_URL ||
  "http://localhost:4400"
).replace(/\/+$/, "")

const SECRET = process.env.BACKUP_API_SECRET || ""

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-internal-secret": SECRET,
  }
}

/** Worker POST (/backup, /restore). accepted:true bekler; hata fırlatır. */
export async function workerTrigger(
  path: "/backup" | "/restore",
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error || `worker ${path} failed (${res.status})`)
  }
}

/** Artefakt stream'i (download proxy). Raw Response döner — body pipe edilir. */
export async function workerFetchArtifact(s3Key: string): Promise<Response> {
  return fetch(`${WORKER_URL}/file?key=${encodeURIComponent(s3Key)}`, {
    headers: { "x-internal-secret": SECRET },
  })
}

/** Artefaktı sil (job/bağlantı silinince). Best-effort. */
export async function workerDeleteArtifact(s3Key: string): Promise<void> {
  await fetch(`${WORKER_URL}/file?key=${encodeURIComponent(s3Key)}`, {
    method: "DELETE",
    headers: { "x-internal-secret": SECRET },
  }).catch(() => {})
}
