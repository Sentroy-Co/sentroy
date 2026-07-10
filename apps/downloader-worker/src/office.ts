import { execFile } from "node:child_process"
import { mkdir, rm, stat, readdir, rename } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"

/**
 * LibreOffice headless ile Office/ODF ↔ PDF dönüştürme. apps/downloader
 * `/api/office/convert` üzerinden server-to-server çağırır (tarayıcı asla
 * doğrudan erişmez). Dosya geçici workdir'e yazılır, `soffice --convert-to`
 * çalışır, çıktı DOWNLOAD_DIR'e (flat, token'lı) taşınır, workdir + LO profili
 * silinir. Eşzamanlılık için her dönüşüm AYRI `-env:UserInstallation` profili
 * kullanır (default profil kilidi paralelde çakışır).
 */

const SOFFICE = process.env.SOFFICE_BIN || "soffice"
const CONVERT_TIMEOUT_MS = Number(process.env.OFFICE_TIMEOUT_MS || String(90_000))

// Hedef format → MIME (indirme Content-Type'ı).
export const TARGET_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  csv: "text/csv",
  txt: "text/plain",
  rtf: "application/rtf",
  html: "text/html",
}

// İzinli giriş uzantıları (yükleme adından türetilir, sanitize edilir).
const ALLOWED_INPUT = new Set([
  "doc", "docx", "odt", "rtf", "txt", "html", "htm",
  "xls", "xlsx", "ods", "csv",
  "ppt", "pptx", "odp",
  "pdf",
])

export function isAllowedTarget(fmt: string): boolean {
  return Object.prototype.hasOwnProperty.call(TARGET_MIME, fmt)
}

/** Yükleme adından güvenli giriş uzantısı çıkar (yoksa null). */
export function inputExtFromName(name: string): string | null {
  const ext = (name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "")
  return ALLOWED_INPUT.has(ext) ? ext : null
}

interface ConvertResult {
  filePath: string
  ext: string
  mime: string
  sizeBytes: number
}

/**
 * inputPath'i targetFmt'e dönüştür. Çıktı destDir'e (flat) <uuid>.<ext> olarak
 * taşınır ve döndürülür. Çağıran inputPath'i ve dönen filePath'i yönetir.
 */
export async function convertOffice(
  inputPath: string,
  inputExt: string,
  targetFmt: string,
  destDir: string,
): Promise<ConvertResult> {
  if (!isAllowedTarget(targetFmt)) throw new Error("Unsupported target format")

  const workDir = path.join(destDir, "office", randomUUID())
  const profileDir = path.join(workDir, "lo-profile")
  await mkdir(profileDir, { recursive: true })

  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        SOFFICE,
        [
          `-env:UserInstallation=file://${profileDir}`,
          "--headless",
          "--norestore",
          "--nolockcheck",
          "--convert-to",
          targetFmt,
          "--outdir",
          workDir,
          inputPath,
        ],
        { timeout: CONVERT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
        (err) => (err ? reject(err) : resolve()),
      )
      child.on("error", reject)
    })

    // Çıktıyı bul (LO <giriş-adı>.<fmt> üretir; emin olmak için dizini tara).
    const produced = (await readdir(workDir)).find((f) => f.toLowerCase().endsWith(`.${targetFmt}`))
    if (!produced) throw new Error("Conversion produced no output (unsupported input?)")

    const outName = `${randomUUID()}.${targetFmt}`
    const outPath = path.join(destDir, outName)
    await rename(path.join(workDir, produced), outPath)
    const st = await stat(outPath)

    return {
      filePath: outPath,
      ext: targetFmt,
      mime: TARGET_MIME[targetFmt]!,
      sizeBytes: st.size,
    }
  } finally {
    // Workdir + profil + giriş dosyası temizliği (çıktı destDir'e taşındı).
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
