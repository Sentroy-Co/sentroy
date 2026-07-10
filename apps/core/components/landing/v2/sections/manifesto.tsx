"use client"

// Manifesto — iki pin arasında nefes bölümü (jüri graft'ı: spatial-editorial).
//
// Pin YOK, scrub-pin YOK: boot'un dolly-in'i ile scene-build'in 400vh pin'i
// arasında serbest akışta duran dev tipografi. TextReveal kelime-scrub'ı
// (opacity 0.14 → 1) yalnız transform/opacity kullanır; blur/filter yok.
// Altında 12 ürün adının düşük-opacity ambient marquee şeridi akar —
// "hepsi burada" katalog mesajının tipografik yankısı.
//
// Bilinçli olarak useLandingV2().light()/setActiveProduct çağrısı YAPILMAZ:
// burası ürün beat'i değil, tez cümlesidir; dock koleksiyonu sahnelerde yanar.

import { useTranslations } from "next-intl"
import { LANDING_PRODUCTS } from "../data/products"
import { TextReveal } from "../primitives/text-reveal"
import { InfiniteMarquee } from "../primitives/infinite-marquee"
import { useMotionSafe } from "../primitives/use-motion-safe"

// Dev tipografi ölçeği — spec: text-4xl..text-6xl, geniş max-w, bol dikey padding.
const HEADLINE_CLASS =
  "max-w-5xl text-4xl font-semibold leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.1]"

export function Manifesto() {
  const t = useTranslations("landingV2")
  const { full } = useMotionSafe()

  return (
    <section
      id="manifesto"
      className="relative overflow-hidden px-6 py-36 sm:py-48 lg:py-64"
    >
      <div className="mx-auto w-full max-w-6xl">
        {/* Eyebrow başlık — heading hiyerarşisi için h2; görsel olarak küçük kicker. */}
        <h2 className="mb-10 text-xs font-medium uppercase tracking-[0.3em] text-white/60 sm:mb-14">
          {t("manifesto.kicker")}
        </h2>

        {full ? (
          // Tam koreografi: kelimeler viewport ortasından geçerken yanar.
          <TextReveal text={t("manifesto.body")} className={HEADLINE_CLASS} />
        ) : (
          // Poster (SSR default + mobil + reduced-motion): tam opak, okunur metin.
          // LCP/SEO güvenli — manifesto cümlesi server-render'da eksiksiz görünür.
          <p className={HEADLINE_CLASS}>{t("manifesto.body")}</p>
        )}
      </div>

      {/* Ambient ürün şeridi — dekoratif (ürünler sahnelerde anlatılır), bu yüzden
          aria-hidden. Kenarlarda mask ile yumuşak fade; marquee primitive'i
          hover'da durur ve reduced-motion'da kendi kendini kapatır. */}
      <div
        aria-hidden
        className="mt-24 sm:mt-32 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
      >
        <InfiniteMarquee durationSec={52} className="opacity-40">
          {LANDING_PRODUCTS.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-6 whitespace-nowrap text-sm font-medium uppercase tracking-[0.22em] text-white/60"
            >
              {t(`manifesto.products.${p.id}`)}
              {/* Nokta ayırıcı — ürünün brand renginde çok kısık bir kıvılcım. */}
              <span
                className="inline-block size-1 rounded-full"
                style={{ backgroundColor: p.color, opacity: 0.55 }}
              />
            </span>
          ))}
        </InfiniteMarquee>
      </div>
    </section>
  )
}
