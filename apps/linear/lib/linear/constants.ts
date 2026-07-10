/**
 * Client + server'da paylaşılan Linear sabitleri (triage portu, birebir).
 *
 * Panel-kaynaklı (Linear Lite'tan açılan) talepler bir **Linear etiketiyle**
 * işaretlenir (linear_settings.panelLabelName, vars. "Linear Lite") ve liste
 * filtresi o etikete göre çalışır. Geçmişte description'a görünmez işaretçi gömme
 * denendi ama Linear, açıklamayı kaydederken markdown'ı yeniden serialize
 * edip işaretçiyi düşürüyor (link-ref-def kayboluyor) ya da düz metin olarak
 * gösteriyor (HTML yorumu) — ikisi de güvenilir değil.
 *
 * Aşağıdaki LEGACY işaretçiler yalnız v1.5.0 ve öncesinde açılmış talepleri
 * (description'da `<!-- triage:proxy ... -->`) geriye dönük tanımak için
 * kalır; yeni taleplerde kullanılmaz.
 */

export const LEGACY_PROXY_HEADER_OPEN = "<!-- triage:proxy:start -->"
export const LEGACY_PROXY_HEADER_CLOSE = "<!-- triage:proxy:end -->"

/**
 * Açıklamanın başındaki atıf blockquote'unun panel-imzası. buildProxyHeader
 * her panel talebine `> Submitted by **…**` (linear) veya `> Submitted: **…**`
 * (proxy) ekler. Bu GÖRÜNÜR içerik, hem Linear'ın markdown round-trip'ine hem de
 * takımlar-arası taşımaya dayanıklı (takım-seviyesi etiketin aksine — o, taşımada
 * düşürülür). Bu yüzden panel tespiti, etikete EK OLARAK bu imzaya da bakar;
 * böylece başka takıma taşınan talepler Triage'da kaybolmaz. `**` (markdown bold)
 * imzayı ayırt edici kılar.
 */
export const ATTRIBUTION_SIGNATURE_LINEAR = "Submitted by **"
export const ATTRIBUTION_SIGNATURE_PROXY = "Submitted: **"
/**
 * v1.26.0 öncesinde proxy atıfı `> Submitted on behalf of **…**` idi. Yeni
 * talepler `Submitted:` kullanır; ama eski talepleri panel olarak TANIMAYA devam
 * etmek için tespit filtresi bu legacy imzaya da bakar (yoksa eski proxy talepleri
 * listelerden düşerdi). Yazımda kullanılmaz, yalnız tespitte.
 */
export const ATTRIBUTION_SIGNATURE_PROXY_LEGACY = "Submitted on behalf of **"
