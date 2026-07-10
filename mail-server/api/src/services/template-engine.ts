import mjml from 'mjml';

export type LocalizedValue = string | Record<string, string>;

/**
 * Multilang değeri tek dile indirger. Öncelik: istenen lang > "en" > ilk key.
 */
export function resolveLocalized(
  value: LocalizedValue | null | undefined,
  lang?: string,
): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (lang && value[lang]) return value[lang];
  if (value.en) return value.en;
  const firstKey = Object.keys(value)[0];
  return firstKey ? value[firstKey] : '';
}

/**
 * Multilang değerin tüm string değerlerini array olarak döner (variable extraction için).
 */
export function allLocalizedValues(
  value: LocalizedValue | null | undefined,
): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  return Object.values(value);
}

/**
 * Multilang olup olmadığını kontrol eder.
 */
export function isMultilang(
  value: LocalizedValue | null | undefined,
): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Verilen içeriğin MJML olup olmadığını algılar.
 * `<mjml>` tag'i içeriyorsa MJML, aksi halde düz HTML kabul edilir.
 */
function isMjmlContent(content: string): boolean {
  return /<mjml[\s>]/i.test(content);
}

/**
 * İçeriğin tam bir HTML dökümanı olup olmadığını algılar.
 * `<html>` veya `<body>` tag'i varsa tam doküman kabul edilir.
 */
function isFullHtmlDocument(content: string): boolean {
  return /<(!doctype\s+html|html[\s>]|body[\s>])/i.test(content);
}

/**
 * Düz HTML içeriği minimum bir HTML iskelette sarar.
 * - Kullanıcının CSS/layout'unu bozmamak için stil enjekte etmez
 * - Sadece doctype, charset ve viewport ekler
 * - Eğer içerik zaten tam bir döküman ise olduğu gibi döner
 */
function wrapHtmlAsEmail(html: string): string {
  if (isFullHtmlDocument(html)) {
    return html;
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;">
${html}
</body>
</html>`;
}

/**
 * MJML veya HTML içeriği HTML'e derler.
 * - `<mjml>` tag'i varsa MJML olarak derler
 * - Aksi halde HTML'i e-posta şablonuna sararak döner
 */
export function compileMjml(source: string): string {
  if (!isMjmlContent(source)) {
    return wrapHtmlAsEmail(source);
  }

  const result = mjml(source, { validationLevel: 'soft' });
  if (result.errors.length > 0) {
    const critical = result.errors.filter((e) => e.tagName);
    if (critical.length > 0) {
      throw new Error(
        `MJML compilation errors: ${critical.map((e) => e.message).join(', ')}`
      );
    }
  }
  return result.html;
}

/**
 * Multilang MJML body'yi her dil için ayrı ayrı derler.
 */
export function compileMjmlLocalized(
  mjmlBody: LocalizedValue,
): LocalizedValue {
  if (typeof mjmlBody === 'string') return compileMjml(mjmlBody);
  const out: Record<string, string> = {};
  for (const [lang, content] of Object.entries(mjmlBody)) {
    out[lang] = compileMjml(content);
  }
  return out;
}

/**
 * Variable substitution sözdizimi:
 *   - Scalar: {name} veya {{name}}
 *   - Array section: {#products} ... {/products}
 *       İçindeki scalar tag'ler her item için item field'larıyla birlikte
 *       render edilir; outer scope'taki scalar'lar da erişilebilir
 *       (çakışmada item kazanır).
 */

const SECTION_RE = /\{#(\w+)\}([\s\S]*?)\{\/\1\}/g;
const SCALAR_RE = /\{\{?(\w+)\}?\}/g;

export type ScalarValue = string | number | boolean;
export type SectionRows = Array<Record<string, ScalarValue>>;
export type TemplateVarValue = ScalarValue | SectionRows;
export type TemplateVars = Record<string, TemplateVarValue>;

export interface ParsedTemplateSection {
  name: string;
  fields: string[];
}

export interface ParsedTemplate {
  scalars: string[];
  sections: ParsedTemplateSection[];
}

function extractScalarTags(source: string): string[] {
  const set = new Set<string>();
  const re = new RegExp(SCALAR_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) set.add(m[1]);
  return Array.from(set);
}

/**
 * Template'i parse edip scalar + section listesini döndür.
 */
export function parseTemplate(source: string): ParsedTemplate {
  if (!source) return { scalars: [], sections: [] };
  const sections: ParsedTemplateSection[] = [];
  const sectionNames = new Set<string>();
  let stripped = source;
  const re = new RegExp(SECTION_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const [whole, name, body] = m;
    if (sectionNames.has(name)) {
      const existing = sections.find((s) => s.name === name);
      if (existing) {
        const merged = new Set([...existing.fields, ...extractScalarTags(body)]);
        existing.fields = Array.from(merged);
      }
    } else {
      sectionNames.add(name);
      sections.push({ name, fields: extractScalarTags(body) });
    }
    stripped = stripped.replace(whole, '');
  }
  const allScalars = extractScalarTags(stripped);
  const scalars = allScalars.filter((s) => !sectionNames.has(s));
  return { scalars, sections };
}

/**
 * MJML veya HTML string'den variable adlarını çıkarır.
 * Geriye dönük uyumluluk için sadece scalar isimleri döner; section
 * isimlerini de listeye ekler ki UI/audit için tek listede görünsünler.
 */
export function extractVariables(source: string): string[] {
  const parsed = parseTemplate(source);
  return Array.from(
    new Set([...parsed.scalars, ...parsed.sections.map((s) => s.name)])
  );
}

/**
 * Multilang değerlerden tüm variable kalıplarını toplar.
 */
export function extractVariablesFromLocalized(
  ...values: (LocalizedValue | null | undefined)[]
): string[] {
  const all = new Set<string>();
  for (const v of values) {
    for (const str of allLocalizedValues(v)) {
      for (const variable of extractVariables(str)) {
        all.add(variable);
      }
    }
  }
  return Array.from(all);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function substituteScalars(
  source: string,
  scope: Record<string, ScalarValue | undefined>
): string {
  if (!source) return source;
  let result = source;
  for (const [key, value] of Object.entries(scope)) {
    if (value === undefined || value === null || value === '') continue;
    const pattern = new RegExp(`\\{\\{?${escapeRegex(key)}\\}?\\}`, 'g');
    result = result.replace(pattern, String(value));
  }
  return result;
}

/**
 * Template + variables → rendered HTML & subject.
 *
 * Variables shape geriye dönük uyumlu — eski caller'lar `Record<string, string>`
 * geçmeye devam edebilir (section'sız flat). Yeni caller'lar `TemplateVars`
 * geçer; section değerleri `Array<Record<string, ScalarValue>>` olur ve her
 * item için section body item-scope ile render edilir.
 */
export function renderTemplate(
  html: string,
  subject: string,
  variables: Record<string, ScalarValue | SectionRows>
): { html: string; subject: string } {
  // Section render (sadece html'de; subject'te section pratik değil)
  const sectionRe = new RegExp(SECTION_RE.source, 'g');
  const htmlWithSections = html.replace(sectionRe, (_, name: string, body: string) => {
    const value = variables[name];
    if (!Array.isArray(value)) return '';
    return value
      .map((item) => {
        const scope: Record<string, ScalarValue | undefined> = {};
        for (const [k, v] of Object.entries(variables)) {
          if (Array.isArray(v)) continue;
          scope[k] = v;
        }
        for (const [k, v] of Object.entries(item)) scope[k] = v;
        return substituteScalars(body, scope);
      })
      .join('');
  });

  // Outer scope substitution
  const outerScope: Record<string, ScalarValue | undefined> = {};
  for (const [k, v] of Object.entries(variables)) {
    if (Array.isArray(v)) continue;
    outerScope[k] = v;
  }
  return {
    html: substituteScalars(htmlWithSections, outerScope),
    subject: substituteScalars(subject, outerScope),
  };
}
