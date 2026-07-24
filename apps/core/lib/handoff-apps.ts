/**
 * Browser login-handoff yapan uygulamalar — deep-link şema allowlist'i.
 * Her uygulama kendi şemasıyla oturumu geri alır (çakışma olmasın diye ayrı):
 * masaüstü/mail → sentroy://, standalone Meet → sentroy-meet://.
 *
 * `app` YALNIZ path segment'inden okunur (`/[lang]/desktop-auth/[app]`) —
 * query (`?app=`) social (OAuth) login callbackURL'inde düşebildiğinden path
 * kullanıyoruz (OAuth round-trip'inde korunur). Bilinmeyen değer → varsayılan.
 */
export interface HandoffApp {
  scheme: string
  appName: string
}

const HANDOFF_APPS: Record<string, HandoffApp> = {
  sentroy: { scheme: "sentroy", appName: "Sentroy" },
  meet: { scheme: "sentroy-meet", appName: "Sentroy Meet" },
  storage: { scheme: "sentroy-storage", appName: "Sentroy Storage" },
  notes: { scheme: "sentroy-notes", appName: "Sentroy Notes" },
  // Sentroy Tasks (mobil) — altyapı slug'ı `linear`, deep-link şeması
  // `sentroy-tasks`. Eksikti → handoff `sentroy://`'ya düşüp mail app'ini
  // açıyordu (login sonrası yanlış app). Şimdi Tasks'a döner.
  linear: { scheme: "sentroy-tasks", appName: "Sentroy Tasks" },
}

export function resolveHandoffApp(app: string | undefined | null): HandoffApp {
  return HANDOFF_APPS[(app ?? "").toLowerCase()] ?? HANDOFF_APPS.sentroy
}
