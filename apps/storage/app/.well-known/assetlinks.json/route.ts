import { NextResponse } from "next/server"

// Android App Links (Digital Asset Links) — storage.sentroy.com/v/<id> linkini
// Sentroy Storage uygulamasına (com.sentroy.storage) bağlar. `autoVerify`
// intent-filter'ı bu dosyayı doğrular; eşleşirse link uygulama içi zengin
// görüntüleyicide açılır (tarayıcı yerine). SHA256 = upload/release imzalama
// sertifikasının parmak izi (public; gizli değil).
//
// NOT: Play App Signing devreye alınırsa Google'ın imza parmak izi de bu diziye
// EKLENMELİ (fingerprint Play Console → App integrity'den alınır).
export const dynamic = "force-static"

const ASSET_LINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.sentroy.storage",
      sha256_cert_fingerprints: [
        "4F:73:9F:B8:E6:B3:1D:DF:4C:A1:5E:9E:74:A8:11:E2:39:9A:2A:51:77:76:ED:49:82:6E:42:B0:E3:9B:F6:87",
      ],
    },
  },
] as const

export function GET() {
  return NextResponse.json(ASSET_LINKS, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  })
}
