/**
 * Built-in HTML mail template presets — auth project mail editör'de
 * "Şablondan başla" dropdown'una bağlanır. RP varsayılan Sentroy-branded
 * default yerine farklı bir taban template seçer, sonra istediği gibi
 * customize eder.
 *
 * Variable substitution `{key}` formatında — render pipeline (auth-project-
 * mail-events.ts substitute) `{userEmail}`, `{verifyUrl}` vb. expand eder.
 * Reserved'lar her zaman event variables listesinde belirtilir.
 */

export interface AuthMailPreset {
  id: string
  label: string
  description: string
  /** Hangi event kategorilerine uygun (categorize: verification/password/
   *  magic-link/security). Boş ise her event için kullanılabilir. */
  suitableFor: string[]
  /** Subject hint (TR + EN). Editor'da yer tutucu olarak. */
  subjectHint: { tr: string; en: string }
  /** HTML body template. Variable placeholder'lar (`{projectName}`,
   *  `{userEmail}`, `{verifyUrl}`, vb.) substitute pipeline ile değişir. */
  htmlBody: { tr: string; en: string }
}

const BRANDED_MINIMAL: AuthMailPreset = {
  id: "minimal",
  label: "Minimal",
  description:
    "Sade, tek-renk metin tabanlı tasarım. Marketing yerine transaksiyonel/güvenlik mailleri için ideal.",
  suitableFor: [],
  subjectHint: {
    en: "{projectName} — your request",
    tr: "{projectName} — talebiniz",
  },
  htmlBody: {
    en: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111;line-height:1.55">
  <h1 style="font-size:18px;font-weight:600;margin:0 0 16px">{projectName}</h1>
  <p style="margin:0 0 12px;font-size:14px">Hi {userEmail},</p>
  <p style="margin:0 0 24px;font-size:14px">[Replace this with your own message body. Use {variable} placeholders to interpolate event-specific values — see the variable list in the editor.]</p>
  <p style="margin:0 0 24px;font-size:14px"><a href="{actionUrl}" style="color:#111;border-bottom:1px solid #111;text-decoration:none">Open the link</a></p>
  <p style="margin:32px 0 0;font-size:12px;color:#666;border-top:1px solid #eee;padding-top:12px">— {projectName}</p>
</div>`,
    tr: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111;line-height:1.55">
  <h1 style="font-size:18px;font-weight:600;margin:0 0 16px">{projectName}</h1>
  <p style="margin:0 0 12px;font-size:14px">Merhaba {userEmail},</p>
  <p style="margin:0 0 24px;font-size:14px">[Kendi mesaj gövdenizle değiştirin. Event'e özgü değerler için {variable} placeholder'larını kullanın — listeyi editörde görebilirsiniz.]</p>
  <p style="margin:0 0 24px;font-size:14px"><a href="{actionUrl}" style="color:#111;border-bottom:1px solid #111;text-decoration:none">Bağlantıyı aç</a></p>
  <p style="margin:32px 0 0;font-size:12px;color:#666;border-top:1px solid #eee;padding-top:12px">— {projectName}</p>
</div>`,
  },
}

const BRANDED_CARD: AuthMailPreset = {
  id: "card",
  label: "Branded card",
  description:
    "Logo + renk vurgusu + button CTA. Sentroy default'unun daha 'app-mailing' versiyonu.",
  suitableFor: ["verification", "password", "magic-link"],
  subjectHint: {
    en: "{projectName} — action required",
    tr: "{projectName} — aksiyon gerekli",
  },
  htmlBody: {
    en: `<div style="background:#f6f7f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #ececec">
    <div style="text-align:center;margin-bottom:24px">
      <strong style="font-size:14px;letter-spacing:0.06em;text-transform:uppercase;color:#666">{projectName}</strong>
    </div>
    <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;text-align:center">Action required</h2>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.55;text-align:center;color:#444">Hi {userEmail}, please confirm with the button below.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="{actionUrl}" style="display:inline-block;padding:14px 24px;background:{primaryColor};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Continue</a>
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:#999;text-align:center">If you weren't expecting this, you can ignore it safely.</p>
  </div>
</div>`,
    tr: `<div style="background:#f6f7f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #ececec">
    <div style="text-align:center;margin-bottom:24px">
      <strong style="font-size:14px;letter-spacing:0.06em;text-transform:uppercase;color:#666">{projectName}</strong>
    </div>
    <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;text-align:center">Aksiyon gerekli</h2>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.55;text-align:center;color:#444">Merhaba {userEmail}, aşağıdaki butonla onaylayın.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="{actionUrl}" style="display:inline-block;padding:14px 24px;background:{primaryColor};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Devam et</a>
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:#999;text-align:center">Bu maili beklemiyorduysanız güvenle görmezden gelebilirsiniz.</p>
  </div>
</div>`,
  },
}

const BRANDED_PLAIN: AuthMailPreset = {
  id: "plain",
  label: "Plain text style",
  description:
    "Tamamen text. Spam filter dostu, kısa transaksiyonel mailler için.",
  suitableFor: ["security"],
  subjectHint: {
    en: "{projectName} — important",
    tr: "{projectName} — önemli",
  },
  htmlBody: {
    en: `<div style="font-family:'SF Mono','Monaco',monospace;font-size:13px;color:#222;max-width:560px;margin:24px auto;padding:0 16px;line-height:1.6">
<p>Hi {userEmail},</p>

<p>[Brief plain-text message. Replace with event-specific copy.]</p>

<p>If applicable:<br>
{actionUrl}</p>

<p>— {projectName}</p>
</div>`,
    tr: `<div style="font-family:'SF Mono','Monaco',monospace;font-size:13px;color:#222;max-width:560px;margin:24px auto;padding:0 16px;line-height:1.6">
<p>Merhaba {userEmail},</p>

<p>[Kısa düz-metin mesaj. Event'e özgü içerikle değiştirin.]</p>

<p>İlgili bağlantı:<br>
{actionUrl}</p>

<p>— {projectName}</p>
</div>`,
  },
}

export const AUTH_MAIL_PRESETS: AuthMailPreset[] = [
  BRANDED_MINIMAL,
  BRANDED_CARD,
  BRANDED_PLAIN,
]

export function findPreset(id: string): AuthMailPreset | null {
  return AUTH_MAIL_PRESETS.find((p) => p.id === id) ?? null
}
