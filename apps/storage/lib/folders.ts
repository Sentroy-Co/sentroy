export const DEFAULT_MEDIA_FOLDER = "uploads"

export function normalizeFolderPath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) =>
      segment
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[.-]+|[.-]+$/g, ""),
    )
    .filter(Boolean)
    .join("/")
}

export function toMediaFolder(path: string): string {
  return normalizeFolderPath(path) || DEFAULT_MEDIA_FOLDER
}

export function fromMediaFolder(folder: string | null | undefined): string {
  if (!folder || folder === DEFAULT_MEDIA_FOLDER) return ""
  return normalizeFolderPath(folder)
}

export function joinFolderPath(parent: string, name: string): string {
  const next = normalizeFolderPath(name)
  const base = normalizeFolderPath(parent)
  return normalizeFolderPath(base ? `${base}/${next}` : next)
}
