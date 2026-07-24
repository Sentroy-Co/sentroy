import { NextResponse } from "next/server"

// Apple App Site Association — iOS Universal Links.
// storage.sentroy.com/v/<id> paylaşım linkine dokunulduğunda Sentroy Storage
// uygulaması (com.sentroy.storage) yüklüyse tarayıcı yerine uygulama açılır ve
// zengin görüntüleyiciye (Drive-tarzı) düşer. Uygulama yoksa link tarayıcıda
// /v/[id] sayfasını gösterir — ikisinde de aynı deneyim.
//
// `.well-known/*` yolu bir nokta içerdiği için middleware matcher'ı tarafından
// zaten baypas edilir (locale/session dokunmaz). iOS bu dosyayı UZANTISIZ ve
// application/json content-type ile ister — route handler ikisini de garanti eder.
export const dynamic = "force-static"

const AASA = {
  applinks: {
    details: [
      {
        appIDs: ["9LGS9R5LQ4.com.sentroy.storage"],
        components: [{ "/": "/v/*", comment: "Paylaşılan dosya görüntüleyici" }],
      },
    ],
  },
} as const

export function GET() {
  return NextResponse.json(AASA, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  })
}
