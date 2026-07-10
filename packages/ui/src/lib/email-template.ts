/**
 * Email template variable engine — Mustache-benzeri minimum syntax.
 *
 * Desteklenen yapılar:
 *   - Scalar substitution: {name}, {{name}}
 *   - Array sections: {#products} ... {/products}
 *       Section içinde her item için tekrar render. Item field'ları
 *       outer scope ile birleşir; aynı isimde collision olursa item kazanır.
 *
 * Tasarım notları:
 *   - Pure JS, dependency yok — hem mail-server (Node) hem browser'da çalışır.
 *   - Nested section'lar (section içinde section) implement edilmedi: email
 *     template'leri pratikte tek seviyeli array iter eder. Gerekirse ileride
 *     recursive parser eklenebilir.
 *   - Parser regex tabanlı; tag eşleşmesi yoksa silently ignore (bozuk
 *     template kullanıcıya beyaz preview göstermesin).
 */
export type ScalarValue = string | number | boolean
export type SectionValue = Array<Record<string, ScalarValue>>
export type TemplateVarValue = ScalarValue | SectionValue
export type TemplateVars = Record<string, TemplateVarValue>

export interface ParsedTemplateSection {
  name: string
  fields: string[]
}

export interface ParsedTemplate {
  /** Top-level scalar variables (section dışındakiler). */
  scalars: string[]
  /** Array sections, her birinin item field'ları ile. */
  sections: ParsedTemplateSection[]
}

const SECTION_RE = /\{#(\w+)\}([\s\S]*?)\{\/\1\}/g
/**
 * Inverted (Mustache `{^name}...{/^name}`) — body renders only when
 * the named scalar is missing/empty/false. The `/^` close tag is
 * required so paired `{#name}` truthy sections don't accidentally
 * eat each other on greedy match.
 */
const INVERTED_SECTION_RE = /\{\^(\w+)\}([\s\S]*?)\{\/\^\1\}/g
const SCALAR_RE = /\{\{?(\w+)\}?\}/g

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

/** Verilen string'den `{name}` / `{{name}}` scalar tag'lerini çıkar. */
function extractScalarTags(source: string): string[] {
  const out = new Set<string>()
  let m: RegExpExecArray | null
  // Yeni regex instance — global flag stateful, paralel çağrı bozar.
  const re = new RegExp(SCALAR_RE.source, "g")
  while ((m = re.exec(source)) !== null) out.add(m[1])
  return Array.from(out)
}

/**
 * Template'i parse edip scalar + section listesini döndür.
 * Section field'ları outer scalar'lardan ayrı tutulur; UI farklı input
 * tipinde gösterebilsin diye.
 *
 * Inverted sections (`{^name}...{/^name}`) and truthy guard sections
 * (`{#name}...{/name}` where the scalar is non-array) are first-class
 * here too — their names land in the scalar list rather than the
 * sections list, since the editor UI prompts for a single string and
 * the runtime decides whether to render the body. Duplicate scalars
 * across `{#}` and `{^}` pairs collapse to one entry.
 */
export function parseEmailTemplate(source: string): ParsedTemplate {
  if (!source) return { scalars: [], sections: [] }

  const sections: ParsedTemplateSection[] = []
  const sectionNames = new Set<string>()
  let stripped = source

  // Strip inverted sections first — they only contribute scalars
  // (their name is asked of the user as a single string), not array
  // fields. Stripping prevents the outer scalar pass from emitting
  // the section name twice.
  const invertedScalars = new Set<string>()
  const invertedRe = new RegExp(INVERTED_SECTION_RE.source, "g")
  let im: RegExpExecArray | null
  while ((im = invertedRe.exec(source)) !== null) {
    const [whole, name, body] = im
    invertedScalars.add(name)
    extractScalarTags(body).forEach((s) => invertedScalars.add(s))
    stripped = stripped.replace(whole, "")
  }

  const sectionRe = new RegExp(SECTION_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = sectionRe.exec(stripped)) !== null) {
    const [whole, name, body] = m
    if (sectionNames.has(name)) {
      // Aynı section ismi birden fazla kez varsa field'ları birleştir.
      const existing = sections.find((s) => s.name === name)
      if (existing) {
        existing.fields = uniq([
          ...existing.fields,
          ...extractScalarTags(body),
        ])
      }
    } else {
      sectionNames.add(name)
      sections.push({ name, fields: extractScalarTags(body) })
    }
    stripped = stripped.replace(whole, "")
  }

  // Section dışında kalan scalar'lar — section name'leri dışla (kullanıcı
  // {products} yazmış olabilir ama gerçekten section, scalar değil).
  const allScalars = extractScalarTags(stripped)
  for (const s of invertedScalars) allScalars.push(s)
  const scalars = uniq(allScalars).filter((s) => !sectionNames.has(s))

  return { scalars, sections }
}

/**
 * Aynı parser'ı birden fazla kaynak üzerinde çalıştır (örn name + subject +
 * body locale varyantları), tüm scalars + sections'ı tek listede birleştir.
 */
export function parseEmailTemplates(
  sources: (string | null | undefined)[],
): ParsedTemplate {
  const allScalars = new Set<string>()
  const sectionMap = new Map<string, Set<string>>()
  for (const s of sources) {
    if (!s) continue
    const parsed = parseEmailTemplate(s)
    parsed.scalars.forEach((n) => allScalars.add(n))
    for (const sec of parsed.sections) {
      const existing = sectionMap.get(sec.name) ?? new Set<string>()
      sec.fields.forEach((f) => existing.add(f))
      sectionMap.set(sec.name, existing)
      // Bu section name scalar olarak da görünmesin
      allScalars.delete(sec.name)
    }
  }
  return {
    scalars: Array.from(allScalars),
    sections: Array.from(sectionMap.entries()).map(([name, fields]) => ({
      name,
      fields: Array.from(fields),
    })),
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Tek bir scope üzerinden scalar substitution. Doldurulmamış key'ler olduğu
 *  gibi kalır (kullanıcı placeholder görüp düzeltebilsin). */
function substituteScalars(
  source: string,
  scope: Record<string, ScalarValue | undefined>,
): string {
  if (!source) return source
  return source.replace(SCALAR_RE, (match, key: string) => {
    const v = scope[key]
    return v === undefined || v === null || v === "" ? match : String(v)
  })
}

/** Mustache truthiness — non-empty string, non-zero number, true. Empty
 *  string and `false`/`undefined`/`null` count as falsy. Arrays are
 *  handled by the array iter branch and never reach this helper. */
function isTruthy(v: unknown): boolean {
  if (v === undefined || v === null || v === false) return false
  if (typeof v === "string") return v.length > 0
  if (typeof v === "number") return v !== 0
  return true
}

/**
 * Template'i variables ile render et. Sırayla:
 *   1. Inverted sections (`{^name}...{/^name}`) — name falsy ise body kalır.
 *   2. Array / truthy sections (`{#name}...{/name}`) — array ise iter,
 *      truthy scalar ise tek kez body render, falsy ise drop.
 *   3. Outer scalar substitution.
 *
 * Throw etmez — invalid section / missing array silently boş render olur,
 * kullanıcı template'i debug edebilsin diye placeholder ham haliyle kalır.
 */
export function renderEmailTemplate(
  source: string,
  variables: TemplateVars,
): string {
  if (!source) return ""

  const outerScope: Record<string, ScalarValue | undefined> = {}
  for (const [k, v] of Object.entries(variables)) {
    if (Array.isArray(v)) continue
    outerScope[k] = v
  }

  // 1. Inverted sections — falsy scalar leaves the body intact (with
  //    inner scalar substitution), truthy scalar drops the body.
  const invertedRe = new RegExp(INVERTED_SECTION_RE.source, "g")
  let stage = source.replace(
    invertedRe,
    (_, name: string, body: string) => {
      const value = variables[name]
      if (Array.isArray(value)) {
        return value.length === 0 ? substituteScalars(body, outerScope) : ""
      }
      return isTruthy(value) ? "" : substituteScalars(body, outerScope)
    },
  )

  // 2. Truthy / array sections — the original `{#name}` syntax now
  //    doubles as a truthy guard for non-array scalars. Empty array
  //    or falsy scalar drops the body; non-empty array iterates;
  //    truthy scalar emits the body once with outer-scope scalars.
  const sectionRe = new RegExp(SECTION_RE.source, "g")
  stage = stage.replace(sectionRe, (_, name: string, body: string) => {
    const value = variables[name]
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          const scope: Record<string, ScalarValue | undefined> = {
            ...outerScope,
          }
          for (const [k, v] of Object.entries(item)) scope[k] = v
          return substituteScalars(body, scope)
        })
        .join("")
    }
    return isTruthy(value) ? substituteScalars(body, outerScope) : ""
  })

  // 3. Outer scalar substitution
  return substituteScalars(stage, outerScope)
}

/**
 * Default vars üret — UI'a "boş" bir başlangıç değeri vermek için. Scalar'lar
 * boş string, section'lar tek satır default field'larla.
 */
export function buildDefaultVars(parsed: ParsedTemplate): TemplateVars {
  const vars: TemplateVars = {}
  for (const s of parsed.scalars) vars[s] = ""
  for (const sec of parsed.sections) {
    const row: Record<string, ScalarValue> = {}
    for (const f of sec.fields) row[f] = ""
    vars[sec.name] = [row]
  }
  return vars
}

// Backwards compat: scalar-only API (eski kodlar için drop-in)
export function extractScalarVarNames(source: string): string[] {
  return parseEmailTemplate(source).scalars
}

// suppress unused export warning for the private regex constants
void SECTION_RE
void SCALAR_RE
void INVERTED_SECTION_RE
