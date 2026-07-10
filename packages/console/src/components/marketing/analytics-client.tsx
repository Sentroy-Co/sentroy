"use client"

import Script from "next/script"
import { useCookieConsent } from "@workspace/console/stores/cookie-consent"

import type { AnalyticsScriptsSeo } from "./analytics-scripts"

interface AnalyticsClientProps {
  ids: AnalyticsScriptsSeo
}

/**
 * Client-side analytics loader. Mounts next/script tags only after the user
 * grants the matching consent category. Each script also requires its id/domain
 * to be present (no half-configured snippets land in the DOM).
 *
 * All scripts use `strategy="afterInteractive"` so they never block hydration
 * or first paint.
 */
export function AnalyticsClient({ ids }: AnalyticsClientProps) {
  const consent = useCookieConsent((s) => s.consent)

  const analyticsOk = consent?.analytics === true
  const marketingOk = consent?.marketing === true

  const { gaId, gtmId, metaPixelId, plausibleDomain, hotjarId } = ids

  return (
    <>
      {/* Google Analytics 4 — analytics category */}
      {analyticsOk && gaId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
          </Script>
        </>
      ) : null}

      {/* Google Tag Manager — analytics category */}
      {analyticsOk && gtmId ? (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      ) : null}

      {/* Plausible — analytics category */}
      {analyticsOk && plausibleDomain ? (
        <Script
          src="https://plausible.io/js/script.js"
          data-domain={plausibleDomain}
          strategy="afterInteractive"
        />
      ) : null}

      {/* Hotjar — analytics category */}
      {analyticsOk && hotjarId ? (
        <Script id="hotjar" strategy="afterInteractive">
          {`(function(h,o,t,j,a,r){
h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
h._hjSettings={hjid:${hotjarId},hjsv:6};
a=o.getElementsByTagName('head')[0];
r=o.createElement('script');r.async=1;
r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
a.appendChild(r);
})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`}
        </Script>
      ) : null}

      {/* Meta Pixel — marketing category */}
      {marketingOk && metaPixelId ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixelId}');
fbq('track', 'PageView');`}
        </Script>
      ) : null}
    </>
  )
}
