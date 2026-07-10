import { PreferencesClient } from "./preferences-client"
import { resolvePublicLang, getPublicStrings } from "../../../../lib/public-strings"

interface Props {
  params: Promise<{ slug: string; lang: string }>
  searchParams: Promise<{ lang?: string; token?: string }>
}

export default async function PreferencesPage({ params, searchParams }: Props) {
  const { slug, lang } = await params
  const { lang: queryLang, token } = await searchParams
  const resolved = await resolvePublicLang(lang || queryLang)
  const t = getPublicStrings(resolved)

  if (!token) {
    return (
      <div className="min-h-svh bg-background text-foreground flex items-center justify-center p-4">
        <main className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">{t.prefMissingTokenTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.prefIntro}</p>
        </main>
      </div>
    )
  }

  return (
    <PreferencesClient
      slug={slug}
      token={token}
      lang={resolved}
      strings={{
        title: t.prefTitle,
        loading: t.subscribeSubmitting,
        loadFailed: t.prefLoadFailed,
        emailLabel: t.prefEmailLabel,
        filterIntro: t.prefComponentsHint,
        componentsHeading: t.subscribeComponentsHeading,
        saveButton: t.prefSaveButton,
        savingButton: t.prefSavingButton,
        savedToast: t.prefSavedToast,
        saveFailedToast: t.prefSaveFailedToast,
        unsubscribeButton: t.prefUnsubscribeButton,
        backLink: t.prefBackLink,
      }}
    />
  )
}
