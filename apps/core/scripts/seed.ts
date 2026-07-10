import { MongoClient } from "mongodb"
import { auth } from "@workspace/auth/server/auth"

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error("MONGODB_URI is not set")
  process.exit(1)
}

const adminEmail = process.env.ADMIN_EMAIL || "admin@sentroy.com"
const adminPassword = process.env.ADMIN_PASSWORD
if (!adminPassword) {
  console.error("ADMIN_PASSWORD is not set")
  process.exit(1)
}

async function seed() {
  const client = new MongoClient(uri!)
  await client.connect()
  // MONGODB_DATABASE env'i açıkça verilmişse onu kullan; yoksa URI'deki
  // path'ten driver default. URI tek-database adı içeriyorsa OK; tek
  // cluster'da birden fazla env (staging/prod) tutuyorsan MONGODB_DATABASE
  // ile ayrıştır.
  const db = client.db(process.env.MONGODB_DATABASE)

  console.log("Connected to MongoDB")

  // Create indexes
  console.log("Creating indexes...")

  await db
    .collection("companies")
    .createIndex({ slug: 1 }, { unique: true })
  await db.collection("companies").createIndex({ ownerId: 1 })

  await db
    .collection("company_members")
    .createIndex({ companyId: 1, userId: 1 }, { unique: true })
  await db.collection("company_members").createIndex({ userId: 1 })

  await db.collection("plans").createIndex({ isDefault: 1 })
  await db.collection("plans").createIndex({ isActive: 1 })

  await db
    .collection("coupons")
    .createIndex({ code: 1 }, { unique: true })

  await db
    .collection("contacts")
    .createIndex({ companyId: 1, email: 1 }, { unique: true })
  await db.collection("contacts").createIndex({ companyId: 1, tags: 1 })

  await db.collection("contact_lists").createIndex({ companyId: 1 })
  await db
    .collection("contact_list_members")
    .createIndex({ listId: 1, contactId: 1 }, { unique: true })

  await db.collection("smtp_credentials").createIndex({ companyId: 1 })
  await db
    .collection("smtp_credentials")
    .createIndex({ username: 1 }, { unique: true })

  await db
    .collection("audit_logs")
    .createIndex({ companyId: 1, createdAt: -1 })
  await db
    .collection("audit_logs")
    .createIndex({ userId: 1, createdAt: -1 })

  await db
    .collection("newsletter_subscribers")
    .createIndex({ email: 1 }, { unique: true })
  await db
    .collection("newsletter_subscribers")
    .createIndex({ createdAt: -1 })

  // App Store
  await db.collection("sentroy_apps").createIndex({ appId: 1 }, { unique: true })
  await db.collection("sentroy_apps").createIndex({ slug: 1 }, { unique: true })
  await db.collection("sentroy_apps").createIndex({ status: 1, visibility: 1 })
  await db.collection("sentroy_apps").createIndex({ developerCompanyId: 1 })
  await db.collection("sentroy_apps").createIndex({ ownerUserId: 1 })
  await db.collection("sentroy_apps").createIndex({ embedOrigin: 1 })
  await db.collection("sentroy_apps").createIndex({ "appearance.category": 1, ratingAvg: -1 })
  await db.collection("app_reviews").createIndex({ appId: 1, userId: 1 }, { unique: true })
  await db.collection("app_reviews").createIndex({ appId: 1, createdAt: -1 })
  await db.collection("app_installs").createIndex({ userId: 1, appId: 1, companyId: 1 }, { unique: true })
  await db.collection("app_installs").createIndex({ appId: 1 })
  await db.collection("app_installs").createIndex({ companyId: 1, status: 1 })
  await db.collection("app_installs").createIndex({ polarSubscriptionId: 1 }, { sparse: true })

  // Sistem tek-seferlik ürün satın alımları (system-purchase.ts)
  await db.collection("system_purchases").createIndex({ polarOrderId: 1 }, { unique: true })
  await db.collection("system_purchases").createIndex({ userId: 1, app: 1, createdAt: -1 })
  await db.collection("system_purchases").createIndex({ userId: 1, reference: 1 })

  console.log("Indexes created")

  // Seed plans
  const existingPlans = await db.collection("plans").countDocuments()
  if (existingPlans === 0) {
    console.log("Seeding plans...")

    const now = new Date()
    const plans = [
      {
        name: { en: "Free", tr: "Ucretsiz" },
        description: {
          en: "Get started with basic email features",
          tr: "Temel email ozellikleriyle baslayin",
        },
        maxCompanies: 1,
        maxDomainsPerCompany: 1,
        maxMembersPerCompany: 2,
        maxMailboxesPerCompany: 3,
        maxContacts: 500,
        storageLimit: 50,
        trashRetentionDays: 7,
        monthlyEmailLimit: 1000,
        features: ["email_send", "inbox", "templates"],
        price: 0,
        isDefault: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: { en: "Pro", tr: "Pro" },
        description: {
          en: "For growing teams with advanced needs",
          tr: "Gelisen ekipler icin gelismis ozellikler",
        },
        maxCompanies: 3,
        maxDomainsPerCompany: 5,
        maxMembersPerCompany: 10,
        maxMailboxesPerCompany: 25,
        maxContacts: 10000,
        storageLimit: 1024,
        trashRetentionDays: 30,
        monthlyEmailLimit: 50000,
        features: [
          "email_send",
          "inbox",
          "templates",
          "audience",
          "webhooks",
          "smtp",
          "statistics",
        ],
        price: 2900,
        isDefault: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: { en: "Enterprise", tr: "Kurumsal" },
        description: {
          en: "Unlimited power for large organizations",
          tr: "Buyuk organizasyonlar icin sinirsiz guc",
        },
        maxCompanies: 10,
        maxDomainsPerCompany: -1,
        maxMembersPerCompany: -1,
        maxMailboxesPerCompany: -1,
        maxContacts: -1,
        storageLimit: 51200,
        trashRetentionDays: 90,
        monthlyEmailLimit: 500000,
        features: [
          "email_send",
          "inbox",
          "templates",
          "audience",
          "webhooks",
          "smtp",
          "statistics",
          "api_keys",
          "custom_dkim",
          "priority_support",
        ],
        price: 9900,
        isDefault: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]

    await db.collection("plans").insertMany(plans)
    console.log("Plans seeded: Free, Pro, Enterprise")
  } else {
    console.log("Plans already exist, skipping")
  }

  // Seed admin user via BetterAuth API
  const existingAdmin = await db
    .collection("user")
    .findOne({ email: adminEmail })

  if (!existingAdmin) {
    console.log(`Seeding admin user: ${adminEmail}`)

    const defaultPlan = await db
      .collection("plans")
      .findOne({ isDefault: true })

    // Use BetterAuth's signUpEmail to properly hash the password
    const result = await auth.api.signUpEmail({
      body: {
        name: "System Admin",
        email: adminEmail,
        password: adminPassword!,
      },
    })

    if (result.user) {
      // Update the user with admin role and plan
      await db.collection("user").updateOne(
        { email: adminEmail },
        {
          $set: {
            role: "admin",
            status: "active",
            planId: defaultPlan?._id?.toString() || null,
            emailVerified: true,
          },
        }
      )
      console.log("Admin user seeded and promoted to admin role")
    } else {
      console.error("Failed to create admin user")
    }
  } else {
    console.log("Admin user already exists, skipping")
  }

  // Seed landing logos (public/trusted)
  const existingLogos = await db
    .collection("landing_logos")
    .countDocuments()
  if (existingLogos === 0) {
    console.log("Seeding landing logos...")
    const now = new Date()
    const logoSeed: Array<{ file: string; name: string }> = [
      { file: "amg.svg", name: "AMG" },
      { file: "asus.svg", name: "ASUS" },
      { file: "bosch.svg", name: "Bosch" },
      { file: "british-council.svg", name: "British Council" },
      { file: "buzzfeed.svg", name: "BuzzFeed" },
      { file: "creative-cloud.svg", name: "Creative Cloud" },
      { file: "ferrari.svg", name: "Ferrari" },
      { file: "figma.svg", name: "Figma" },
      { file: "heineken.svg", name: "Heineken" },
      { file: "lenovo.svg", name: "Lenovo" },
      { file: "levis.svg", name: "Levi's" },
      { file: "mcdonalds.svg", name: "McDonald's" },
      { file: "nike.svg", name: "Nike" },
      { file: "oracle.svg", name: "Oracle" },
      { file: "panasonic.svg", name: "Panasonic" },
      { file: "pubg.svg", name: "PUBG" },
      { file: "ray-ban.svg", name: "Ray-Ban" },
      { file: "redbull.svg", name: "Red Bull" },
      { file: "the-north-face.svg", name: "The North Face" },
      { file: "toshiba.svg", name: "Toshiba" },
      { file: "under-armour.svg", name: "Under Armour" },
      { file: "walmart.svg", name: "Walmart" },
      { file: "yamaha.svg", name: "Yamaha" },
    ]
    const docs = logoSeed.map((entry, idx) => ({
      name: entry.name,
      imageUrl: `/trusted/${entry.file}`,
      url: null,
      order: idx,
      createdAt: now,
      updatedAt: now,
    }))
    await db.collection("landing_logos").insertMany(docs)
    console.log(`Landing logos seeded: ${docs.length}`)
  } else {
    console.log("Landing logos already exist, skipping")
  }

  // Seed landing Z-sections
  const existingZ = await db
    .collection("landing_zsections")
    .countDocuments()
  if (existingZ === 0) {
    console.log("Seeding landing Z-sections...")
    const now = new Date()
    const sections = [
      {
        title: {
          en: "Stop fighting DNS records",
          tr: "DNS kayitlariyla savasmayi birakin",
        },
        problem: {
          en: "Copy-pasting SPF, DKIM and DMARC records across registrars is error-prone and kills days.",
          tr: "SPF, DKIM ve DMARC kayitlarini kayit sirketleri arasinda kopyalamak hata baridi ve gunler aliyor.",
        },
        solution: {
          en: "Domain Connect one-click setup for supported providers. Guided DNS wizard for the rest.",
          tr: "Desteklenen saglayicilar icin Domain Connect tek tikla kurulum. Digerleri icin rehberli DNS sihirbazi.",
        },
        result: {
          en: "Domains verified in minutes, not days. Auto-verification keeps records in sync.",
          tr: "Domainler gunlerce degil dakikalar icinde dogrulaniyor. Otomatik dogrulama kayitlari senkron tutuyor.",
        },
        visual: null,
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: {
          en: "One SDK, every stack",
          tr: "Tek SDK, her yigit",
        },
        problem: {
          en: "Every language needs its own boilerplate. Engineers copy-paste curl snippets and pray.",
          tr: "Her dil kendi boilerplate'ini istiyor. Gelistiriciler curl ornekleri kopyalayip umuda kaliyor.",
        },
        solution: {
          en: "Official SDKs for TypeScript, Go, Python and PHP with multilingual template rendering built in.",
          tr: "TypeScript, Go, Python ve PHP icin cok dilli sablon render'i ile resmi SDK'lar.",
        },
        result: {
          en: "Integrated transactional email in under an hour. Type-safe, documented, versioned.",
          tr: "Islemsel e-posta bir saatten kisa surede entegre. Tip guvenli, dokumante, versiyonlu.",
        },
        visual: null,
        order: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        title: {
          en: "Know what happens after send",
          tr: "Gonderimden sonra ne oldugunu ogrenin",
        },
        problem: {
          en: "Most providers tell you queued and stop there. You learn about bounces from angry users.",
          tr: "Cogu saglayici queued deyip susuyor. Geri donmeleri kizgin kullanicilardan ogreniyorsunuz.",
        },
        solution: {
          en: "Real-time delivery events, open/click tracking, and webhook fan-out for every mail log.",
          tr: "Gercek zamanli teslim olaylari, acilma/tiklama izlemesi ve her mail logu icin webhook yayilimi.",
        },
        result: {
          en: "Live dashboards, proactive bounce handling, and no more late-night support tickets.",
          tr: "Canli panolar, proaktif geri donme yonetimi ve gece yarisi gelen destek talepleri yok.",
        },
        visual: null,
        order: 2,
        createdAt: now,
        updatedAt: now,
      },
    ]
    await db.collection("landing_zsections").insertMany(sections)
    console.log(`Z-sections seeded: ${sections.length}`)
  } else {
    console.log("Z-sections already exist, skipping")
  }

  // Seed landing testimonials
  const existingTestimonials = await db
    .collection("landing_testimonials")
    .countDocuments()
  if (existingTestimonials === 0) {
    console.log("Seeding landing testimonials...")
    const now = new Date()
    const testimonials = buildTestimonials(now)
    await db.collection("landing_testimonials").insertMany(testimonials)
    console.log(`Testimonials seeded: ${testimonials.length}`)
  } else {
    console.log("Testimonials already exist, skipping")
  }

  console.log("\nSeed completed!")
  await client.close()
}

// ─ Testimonials data builder ─────────────────────────────────────────────

interface TestimonialSeed {
  quote: { en: string; tr: string }
  name: string
  title: { en: string; tr: string }
  photoUrl: string | null
  rating: number
  order: number
  createdAt: Date
  updatedAt: Date
}

function buildTestimonials(now: Date): TestimonialSeed[] {
  const data: Array<{
    name: string
    role: { en: string; tr: string }
    quote: { en: string; tr: string }
  }> = [
    {
      name: "Alex Rivera",
      role: {
        en: "CTO, Pulsedrop",
        tr: "CTO, Pulsedrop",
      },
      quote: {
        en: "We replaced a tangled SES + custom suppression pipeline with Sentroy in a single afternoon. Bounce handling finally feels like a solved problem.",
        tr: "Karmasik SES + ozel suppression boru hattimizi tek bir ogleden sonra Sentroy ile degistirdik. Geri donme yonetimi nihayet cozulmus bir sorun gibi.",
      },
    },
    {
      name: "Priya Shah",
      role: {
        en: "Head of Platform, Nomad Labs",
        tr: "Platform Sefi, Nomad Labs",
      },
      quote: {
        en: "Domain Connect took our DNS onboarding from a 40-minute support call down to literally one click. Our success team got a weekend back.",
        tr: "Domain Connect, DNS onboarding surecimizi 40 dakikalik destek cagrisindan tek tika dusurdu. Success ekibimiz haftasonunu geri aldi.",
      },
    },
    {
      name: "Marcus Chen",
      role: {
        en: "Staff Engineer, Quillhub",
        tr: "Kidemli Muhendis, Quillhub",
      },
      quote: {
        en: "The TypeScript SDK is the one I wish I had at every previous company. Type-safe templates are underrated and here they just work.",
        tr: "TypeScript SDK'sini onceki her sirkette isterdim. Tip guvenli sablonlar hafife aliniyor ama burada cidden calisiyor.",
      },
    },
    {
      name: "Eva Lindqvist",
      role: {
        en: "Engineering Manager, Bluewave",
        tr: "Muhendislik Muduru, Bluewave",
      },
      quote: {
        en: "Switching providers used to be a year-long project. With Sentroy we migrated six services in a sprint without a single lost email.",
        tr: "Saglayici degistirmek eskiden bir yillik projeydi. Sentroy ile alti servisi bir sprintte, tek bir kayip e-posta olmadan tasidik.",
      },
    },
    {
      name: "Diego Hernández",
      role: {
        en: "Founder, Lumenhub",
        tr: "Kurucu, Lumenhub",
      },
      quote: {
        en: "BIMI support was the deal breaker. Customers now see our logo in Gmail on day one. It sounds small but trust scores jumped.",
        tr: "BIMI destegi en kritik ozellikti. Musteriler ilk gunden Gmail'de logomuzu goruyor. Kucuk gibi ama guven skorlari firladi.",
      },
    },
    {
      name: "Sarah Okafor",
      role: {
        en: "Lead Developer, Parallax Retail",
        tr: "Bas Gelistirici, Parallax Retail",
      },
      quote: {
        en: "Webhook fan-out is buttery smooth. We finally have real delivery observability in Grafana without hand-rolled scraping.",
        tr: "Webhook yayilimi son derece puruzsuz. Elle scraping yazmadan Grafana'da gercek teslim gozlenebilirligimiz oldu.",
      },
    },
    {
      name: "Jun Tanaka",
      role: {
        en: "Backend Engineer, Vendora",
        tr: "Backend Muhendisi, Vendora",
      },
      quote: {
        en: "The Python SDK feels idiomatic, not a thin REST wrapper. Async support, typed responses, and retry logic baked in.",
        tr: "Python SDK'si ince bir REST wrapper gibi degil, deyimsel hissettiriyor. Async destek, tipli cevaplar ve yeniden deneme mantigi icinde.",
      },
    },
    {
      name: "Noor Hassan",
      role: {
        en: "Product Lead, Ember Health",
        tr: "Urun Lideri, Ember Health",
      },
      quote: {
        en: "Compliance gave us the green light in one review cycle thanks to the audit log and DKIM rotation controls. That never happens.",
        tr: "Denetim logu ve DKIM rotasyon kontrolleri sayesinde compliance tek turda yesil isik verdi. Bu asla olmaz.",
      },
    },
    {
      name: "Claudia Moretti",
      role: {
        en: "CTO, Frostpine",
        tr: "CTO, Frostpine",
      },
      quote: {
        en: "Our OTP delivery latency dropped by 62% after cutting over. Support tickets about missing codes disappeared overnight.",
        tr: "Gecis sonrasi OTP teslim latency'miz %62 dustu. Eksik kodlarla ilgili destek talepleri bir gecede kayboldu.",
      },
    },
    {
      name: "Ravi Kapoor",
      role: {
        en: "Senior SRE, Arclight",
        tr: "Kidemli SRE, Arclight",
      },
      quote: {
        en: "I review a lot of vendors. Sentroy's webhook signing, idempotency keys, and replay tooling are best in class.",
        tr: "Cok saticiyi inceliyorum. Sentroy'un webhook imzalama, idempotency key'leri ve replay araclari sinifinin en iyisi.",
      },
    },
    {
      name: "Lena Schwarz",
      role: {
        en: "Director of Engineering, Payroot",
        tr: "Muhendislik Direktoru, Payroot",
      },
      quote: {
        en: "The dashboard told us about a reputation dip before Google did. We caught and fixed a template issue the same day.",
        tr: "Dashboard itibar dususunu Google'dan once bize soyledi. Bir sablon sorununu ayni gun yakalayip duzelttik.",
      },
    },
    {
      name: "Thabo Nkosi",
      role: {
        en: "Engineering Lead, Safari Ops",
        tr: "Muhendislik Lideri, Safari Ops",
      },
      quote: {
        en: "Multi-language templates without JavaScript in production. Marketing can edit copy in six locales without a code review.",
        tr: "Uretimde JavaScript olmadan cok dilli sablonlar. Pazarlama alti dilde metni kod incelemesi olmadan duzenleyebiliyor.",
      },
    },
    {
      name: "Hannah Weir",
      role: {
        en: "Developer Experience, Stackhollow",
        tr: "Gelistirici Deneyimi, Stackhollow",
      },
      quote: {
        en: "Onboarding docs are actually runnable. I copied the curl from the dashboard and had a first email sent in two minutes.",
        tr: "Onboarding dokumanlari gercekten calistirilabilir. Dashboard'dan curl'u kopyaladim ve iki dakikada ilk e-postayi gonderdim.",
      },
    },
    {
      name: "Omar Farouk",
      role: {
        en: "Founding Engineer, Cedarbyte",
        tr: "Kurucu Muhendis, Cedarbyte",
      },
      quote: {
        en: "I've never had a provider answer a sender reputation question with actual graphs and root-cause hypotheses. Thank you.",
        tr: "Hicbir saglayici gonderen itibari sorumu gercek grafikler ve kok-neden hipotezleriyle yanitlamamisti. Tesekkurler.",
      },
    },
    {
      name: "Isabella Romero",
      role: {
        en: "Head of Customer, Torchline",
        tr: "Musteri Sefi, Torchline",
      },
      quote: {
        en: "We moved all transactional + drip flows to Sentroy. Open rates went up 18% just because we landed in inbox more reliably.",
        tr: "Tum islemsel ve drip akislari Sentroy'a tasidik. Sadece gelen kutusuna daha guvenilir dusunce acilma oranlari %18 arttı.",
      },
    },
    {
      name: "Mikael Berg",
      role: {
        en: "CTO, Greenlane",
        tr: "CTO, Greenlane",
      },
      quote: {
        en: "The Go SDK respects contexts correctly. That tells you everything about the team behind it.",
        tr: "Go SDK'si context'lere dogru sekilde saygi gosteriyor. Bu, arkasindaki ekip hakkinda her seyi soyluyor.",
      },
    },
    {
      name: "Hyerin Park",
      role: {
        en: "Staff Engineer, Orbitwise",
        tr: "Kidemli Muhendis, Orbitwise",
      },
      quote: {
        en: "Per-domain DKIM rotation was a box we checked on paper before. Now it's an actual button and it just works.",
        tr: "Domain bazli DKIM rotasyonu eskiden kagit uzerinde isaretledigimiz bir kutuydu. Simdi gercek bir buton ve cidden calisiyor.",
      },
    },
    {
      name: "Gabriel Silva",
      role: {
        en: "CTO, Lanternpay",
        tr: "CTO, Lanternpay",
      },
      quote: {
        en: "As a fintech we can't afford spoofing. DMARC reporting + BIMI verification finally gave us a story to tell regulators.",
        tr: "Bir fintech olarak spoofing'i karsilayamayiz. DMARC raporlama + BIMI dogrulamasi nihayet duzenleyicilere anlatacak bir hikaye verdi.",
      },
    },
    {
      name: "Aisha Khan",
      role: {
        en: "Growth Engineer, Saffronbox",
        tr: "Buyume Muhendisi, Saffronbox",
      },
      quote: {
        en: "A/B testing on transactional templates without hacking Mailgun tagging? Yes please.",
        tr: "Mailgun tagging'i hack'lemeden islemsel sablonlarda A/B testi? Evet lutfen.",
      },
    },
    {
      name: "Daniel Wright",
      role: {
        en: "Lead Engineer, Blockhorizon",
        tr: "Bas Muhendis, Blockhorizon",
      },
      quote: {
        en: "Webhook retries with exponential backoff, optional dead-letter queue, and signed payloads. Every detail was thought through.",
        tr: "Ustel geri cekilme ile webhook yeniden denemeleri, opsiyonel dead-letter kuyrugu ve imzali yukler. Her detay dusunulmus.",
      },
    },
    {
      name: "Sofia Kowalski",
      role: {
        en: "Engineering Director, Northwind",
        tr: "Muhendislik Direktoru, Northwind",
      },
      quote: {
        en: "Our email incident runbook used to be five pages. It's now one page and mostly says 'check the Sentroy dashboard'.",
        tr: "E-posta olay runbook'umuz eskiden bes sayfaydi. Simdi tek sayfa ve cogunlukla 'Sentroy dashboard'unu kontrol et' yaziyor.",
      },
    },
    {
      name: "Kofi Asante",
      role: {
        en: "Senior Developer, Roomspark",
        tr: "Kidemli Gelistirici, Roomspark",
      },
      quote: {
        en: "I was skeptical about yet another sending API. Two weeks in and I'm recommending Sentroy to everyone in my network.",
        tr: "Bir baska gonderme API'sine supheyle yaklasmistim. Iki hafta sonra tum cevreme Sentroy oneriyorum.",
      },
    },
    {
      name: "Yuki Matsumoto",
      role: {
        en: "Platform Engineer, Mapledrive",
        tr: "Platform Muhendisi, Mapledrive",
      },
      quote: {
        en: "Latency graphs per region helped us explain a Japan-specific spike in five minutes. That visibility is priceless.",
        tr: "Bolge bazli latency grafikleri, Japonya'ya ozgu bir siciki bes dakikada aciklamamiza yardim etti. Bu gorunurluk paha bicilmez.",
      },
    },
    {
      name: "Ella O'Connor",
      role: {
        en: "Founder, Driftloom",
        tr: "Kurucu, Driftloom",
      },
      quote: {
        en: "Sending from day one without a compliance conversation. The defaults are genuinely sensible.",
        tr: "Compliance gorusmesi olmadan ilk gunden gonderim. Varsayilanlar gercekten mantikli.",
      },
    },
    {
      name: "Viktor Ilić",
      role: {
        en: "Lead Platform, Amberforge",
        tr: "Bas Platform, Amberforge",
      },
      quote: {
        en: "Idempotency by default means our retry logic simplified drastically. Less code, fewer bugs, cheaper to run.",
        tr: "Varsayilan idempotency, retry mantigimizi dramatik sekilde sadelestirdi. Daha az kod, daha az bug, daha ucuz calistirma.",
      },
    },
    {
      name: "Meredith Clarke",
      role: {
        en: "Director of Engineering, Grovekit",
        tr: "Muhendislik Direktoru, Grovekit",
      },
      quote: {
        en: "I've migrated email infra three times. This was the first one without a production incident.",
        tr: "Email altyapisini uc kez tasidim. Bu, uretim olayi olmadan yapilan ilk tasima oldu.",
      },
    },
    {
      name: "Nikolai Andreyev",
      role: {
        en: "Senior Engineer, Quartzline",
        tr: "Kidemli Muhendis, Quartzline",
      },
      quote: {
        en: "Replacing four vendors with one bill sealed it for us. The SDK is clean and operations stays boring.",
        tr: "Dort aboneligi tek faturaya indirmek bizim icin isi kesinlestirdi. SDK temiz ve operasyonlar sikici kaliyor.",
      },
    },
    {
      name: "Chiamaka Obi",
      role: {
        en: "Engineering Lead, Tideport",
        tr: "Muhendislik Lideri, Tideport",
      },
      quote: {
        en: "Finally a provider that treats transactional and marketing email as different first-class primitives. It matters more than you think.",
        tr: "Nihayet islemsel ve pazarlama e-postalarini farkli birinci sinif ilkeller olarak ele alan bir saglayici. Sandiginizdan daha cok onemli.",
      },
    },
    {
      name: "Lucas Meyer",
      role: {
        en: "CTO, Hollowbrook",
        tr: "CTO, Hollowbrook",
      },
      quote: {
        en: "Every spec says 'MUST support DMARC reports'. Sentroy is the first provider that actually does something useful with them.",
        tr: "Her spec 'DMARC raporlarini desteklemeli' diyor. Sentroy, bunlarla gercekten yararli bir sey yapan ilk saglayici.",
      },
    },
    {
      name: "Amira Benyahia",
      role: {
        en: "Platform Architect, Coastvault",
        tr: "Platform Mimari, Coastvault",
      },
      quote: {
        en: "Clear limits, transparent pricing, responsive team. It's boring infrastructure and I mean that as the highest compliment.",
        tr: "Net limitler, seffaf fiyatlandirma, tepkili ekip. Sikici altyapi ve bunu en yuksek iltifat olarak kastediyorum.",
      },
    },
  ]

  return data.map((entry, idx) => ({
    quote: entry.quote,
    name: entry.name,
    title: entry.role,
    photoUrl: null,
    rating: 5 - (idx % 4 === 3 ? 1 : 0),
    order: idx,
    createdAt: now,
    updatedAt: now,
  }))
}

seed().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
