/**
 * App Store registry doğrulama güven KÖKÜ — pinned Ed25519 public key'ler.
 *
 * Instance'lar imzalı katalogu bu PINNED key'lere karşı doğrular; /keys
 * discovery endpoint'ine ASLA güvenmez → sunucu ele geçirilse bile bir
 * instance'ın güven kökü değiştirilemez.
 *
 * Baked `SENTROY_REGISTRY_PUBLIC_KEY` = Sentroy'un yayınlanmış katalog imza
 * anahtarının public yarısı (commit'lenmesi güvenli — public). Fork/rotasyon
 * için `APP_REGISTRY_PUBLIC_KEY` (+ `_PREVIOUS`) env'iyle override edilebilir.
 *
 * FAIL-CLOSED: hiçbir geçerli PEM çözülemezse resolvePinnedKeys() boş liste
 * döner → verifyAttached "no-pinned-keys" ile reddeder (asla sessiz kabul).
 * Baked sabit boş bir placeholder'a düşerse de sonuç aynı (fail-closed).
 */

// Sentroy resmi katalog imza anahtarı — public. kid (RFC7638 OKP thumbprint):
// 8sWnEchbmn7uGehDrpx4awByv2YzZv23v2VegKA5QSU
const SENTROY_REGISTRY_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAaYuiGafoiNJE1dMo4kvkCqO0VjH44ijUlzf4KLqfoA0=
-----END PUBLIC KEY-----`

function clean(v: string | undefined): string | null {
  if (!v) return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/**
 * Doğrulama için pinned public PEM listesi (LAZY — env her çağrıda okunur;
 * modül import'unda çalışmaz). Sıra: [primary, previous?].
 *   - primary   = APP_REGISTRY_PUBLIC_KEY ?? baked Sentroy key
 *   - previous  = APP_REGISTRY_PUBLIC_KEY_PREVIOUS (rotasyon grace slotu)
 * Boş/placeholder değerler elenir; hepsi boşsa [] → fail-closed.
 */
export function resolvePinnedKeys(): string[] {
  const primary = clean(process.env.APP_REGISTRY_PUBLIC_KEY) ?? clean(SENTROY_REGISTRY_PUBLIC_KEY)
  const previous = clean(process.env.APP_REGISTRY_PUBLIC_KEY_PREVIOUS)
  const out: string[] = []
  if (primary) out.push(primary)
  if (previous) out.push(previous)
  return out
}
