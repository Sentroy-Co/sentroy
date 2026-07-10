import type { NoteColor, NoteVisibility } from "@workspace/db/types"
import { noteFolderModel } from "@workspace/db/models"

export const NOTE_VISIBILITIES: NoteVisibility[] = [
  "public",
  "members",
  "admins",
  "author",
]

export const NOTE_COLORS: NoteColor[] = [
  "default",
  "yellow",
  "blue",
  "green",
  "pink",
  "purple",
]

/** `text`in ilk anlamlı satırından başlık türet (Apple Notes tarzı; ayrı input yok). */
export function deriveNoteTitle(text: string): string {
  const firstLine =
    text
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? ""
  return firstLine.slice(0, 200)
}

/** folderId'yi doğrula — yalnız caller'ın (userId+companyId) klasörü; değilse null. */
export async function resolveFolderId(
  raw: unknown,
  userId: string,
  companyId: string,
): Promise<string | null> {
  if (typeof raw !== "string" || !raw) return null
  const folder = await noteFolderModel.findById(raw)
  if (folder && folder.userId === userId && folder.companyId === companyId) {
    return folder.id
  }
  return null
}

/** Owner/admin/system-admin → visibility filtresinde `admins` notları da görür. */
export function viewerIsCompanyAdmin(access: {
  session: { user: { role?: string } } | null | undefined
  member: { role?: string } | null
}): boolean {
  return (
    (access.session?.user as { role?: string } | undefined)?.role === "admin" ||
    access.member?.role === "owner" ||
    access.member?.role === "admin"
  )
}
