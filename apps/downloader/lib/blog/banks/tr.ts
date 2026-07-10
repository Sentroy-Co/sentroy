import type { Bank } from "./index"

/**
 * Türkçe cümle bankası. Önce bu hazırlanır; onaylandıktan sonra çeviri
 * workflow'u diğer dilleri (es, pt, de, fr, ru, ar, hi, id) üretir.
 */
export const tr: Bank = {
  leads: [
    "{Keyword} aramak yerine işi tek adımda bitirin: bağlantıyı yapıştırın, {brand} saniyeler içinde dosyayı hazırlasın. Kurulum yok, üyelik yok, gizli ücret yok.",
    "{platform} bağlantısını kutuya yapıştırmanız yeterli — {keyword} bundan daha kolay olamazdı. Hızlı, ücretsiz ve tamamen tarayıcı üzerinden çalışır.",
    "İnternette {keyword} için onlarca site var ama çoğu reklam tuzağı. {brand} farklı: temiz arayüz, yüksek hız ve hiçbir zorunlu kayıt olmadan indirme.",
    "{Keyword} işlemini en hızlı ve en kolay yoldan yapmak isteyenler için tek sayfalık bir çözüm hazırladık. Linki yapıştırın, kaliteyi seçin, indirin.",
    "Video mu lazım, yoksa sadece sesi mi? {keyword} ihtiyacınız ne olursa olsun {brand} ikisini de halleder — üstelik telefonda da masaüstünde de sorunsuz.",
    "{Keyword} dendiğinde akla hız, güvenlik ve sadelik gelmeli. Bu rehber, {platform} içeriğini saniyeler içinde cihazınıza indirmenin en pratik yolunu anlatıyor.",
    "Uygulama indirmeden, eklenti kurmadan, hesap açmadan {keyword}: {brand} ile bağlantıyı yapıştırdığınız anda dosyanız hazırlanmaya başlar.",
  ],

  whatHeadings: [
    "{Keyword} nedir ve nasıl çalışır?",
    "{brand} ile {keyword} nasıl olur?",
    "Kısaca: {keyword}",
    "{Keyword} hakkında bilmeniz gerekenler",
  ],
  whatBodies: [
    "{brand}, {platform} bağlantısını alır, dosyayı kendi sunucularında hazırlar ve size doğrudan indirme bağlantısı verir. Tüm işlem tarayıcıda olur; cihazınıza hiçbir program kurmanız gerekmez.",
    "{Keyword} işlemi üç parçadan oluşur: bağlantıyı çözümleme, istediğiniz formatı hazırlama ve dosyayı size iletme. {brand} bu üç adımı tek ekranda, saniyeler içinde tamamlar.",
    "Arka planda güçlü bir dönüştürme motoru çalışır; siz yalnızca linki yapıştırır ve kaliteyi seçersiniz. Geri kalan her şeyi {brand} üstlenir.",
    "Klasik indirme sitelerinin aksine {brand} sizi sahte 'İndir' butonlarıyla yormaz. Tek bir alan vardır: bağlantı kutusu. Yapıştırın, gerisini bırakın.",
    "{platform} üzerindeki bir videonun ya da sesin kopyasını cihazınıza almak istediğinizde {brand} devreye girer. Bağlantıyı tanır, içeriği çözer ve indirilebilir bir dosyaya dönüştürür.",
    "{Keyword}, teknik bilgi gerektiren bir iş gibi görünse de aslında değil. {brand} tüm karmaşıklığı gizler; size yalnızca yapıştırmak ve indirmek kalır.",
  ],

  howHeadings: [
    "{Keyword}: adım adım",
    "3 adımda {keyword}",
    "Nasıl indirilir?",
    "{Keyword} için izlenecek yol",
  ],
  howIntros: [
    "Tüm süreç üç basit adımdan ibaret — ortalama yarım dakika sürer:",
    "Aşağıdaki adımları izleyin; ne hesap ne de kurulum gerekir:",
    "İlk kez deniyor olsanız bile bir dakikadan kısa sürede tamamlarsınız:",
    "İşte {keyword} için izlemeniz gereken üç kolay adım:",
  ],
  steps: [
    {
      title: ["Bağlantıyı kopyalayın", "Linki alın", "{platform} adresini kopyalayın"],
      body: [
        "İndirmek istediğiniz {platform} içeriğinin bağlantısını kopyalayın. Tarayıcının adres çubuğundan ya da paylaş menüsünden alabilirsiniz.",
        "{platform} uygulamasında veya sitesinde 'Paylaş → Bağlantıyı kopyala' deyin; ya da adres çubuğundaki URL'yi seçip kopyalayın.",
        "İlgili video veya sesin tam bağlantısını panonuza alın — kısaltılmış paylaşım linkleri de çalışır.",
      ],
    },
    {
      title: ["Kutuya yapıştırın", "Bağlantıyı yapıştırın", "URL'yi alana bırakın"],
      body: [
        "Kopyaladığınız bağlantıyı {domain} üzerindeki kutuya yapıştırın. {brand} içeriği anında tanır ve mevcut kalite seçeneklerini gösterir.",
        "Bağlantıyı indirme alanına yapıştırın; saniyeler içinde başlık, küçük resim ve indirme seçenekleri ekrana gelir.",
        "URL'yi yapıştırdığınız an {brand} videoyu çözer ve hangi formatlarda indirebileceğinizi listeler.",
      ],
    },
    {
      title: ["Formatı seçin ve indirin", "Kaliteyi seçin", "İndir'e basın"],
      body: [
        "Video kalitesini (1080p'ye kadar) ya da ses formatını (MP3, WAV, M4A) seçin ve 'İndir'e basın. Dosyanız hazırlanır ve cihazınıza iner.",
        "İster yüksek çözünürlüklü MP4 isterseniz yalnızca MP3 sesi seçin; {brand} dosyayı hazırlayıp size indirme bağlantısını verir.",
        "İhtiyacınıza uygun formatı seçin, indirmeye tıklayın. Dosya bir saat içinde sunuculardan otomatik silinir, gizliliğiniz korunur.",
      ],
    },
  ],

  qualityHeadings: [
    "Hangi kalite ve formatlar destekleniyor?",
    "Kalite ve format seçenekleri",
    "MP4, MP3 ve daha fazlası",
    "Ne indirebilirsiniz?",
  ],
  qualityBodies: [
    "Video tarafında 360p'den 1080p'ye kadar MP4 indirebilirsiniz. Ses isterseniz MP3, WAV veya M4A formatları arasından seçim yapabilir, müzik ve podcast'leri saf ses olarak kaydedebilirsiniz.",
    "{brand} videoyu kaynağındaki en iyi kalitede sunmaya çalışır. Bant genişliğinizi düşünerek daha küçük bir çözünürlük de seçebilirsiniz — karar tamamen sizde.",
    "Yalnızca sesi mi istiyorsunuz? MP3 dönüştürme tek tıkla yapılır ve sonuç temiz, oynatıcı dostu bir dosya olur. Ders, müzik veya röportaj arşivlemek için idealdir.",
    "Format seçimi indirmeden önce yapılır; yanlış dosya inmez. Video için MP4, ses için MP3/WAV/M4A — ihtiyacınıza göre tek ekranda belirlenir.",
    "Yüksek çözünürlüklü video mu, yer kaplamayan ses mi? {brand} her iki senaryoyu da destekler ve dönüştürme sırasında kaliteyi mümkün olduğunca korur.",
    "İndirilen MP3 dosyaları standart bit hızında, tüm cihaz ve oynatıcılarla uyumludur. MP4 videolar ise sesli ve tek parça olarak gelir.",
  ],

  benefitsHeading: [
    "Neden {brand}?",
    "{brand} ile {keyword} avantajları",
    "Bu aracı farklı kılan ne?",
    "Öne çıkan özellikler",
  ],
  benefits: [
    "Tamamen ücretsiz — gizli paket, kredi kartı veya abonelik yok.",
    "Üyelik gerekmez; e-posta bile istemiyoruz.",
    "Uygulama veya tarayıcı eklentisi kurmanıza gerek yok.",
    "Telefon, tablet ve bilgisayarda aynı hızda çalışır.",
    "1080p'ye kadar MP4 video desteği.",
    "MP3, WAV ve M4A ses formatlarına dönüştürme.",
    "Hazırlanan dosyalar 1 saat içinde sunuculardan otomatik silinir.",
    "Reklam tuzağı, sahte indirme butonu ve yönlendirme yok.",
    "Saniyeler içinde sonuç — bekleme, kuyruk veya sınırlama yok.",
    "Bağlantıyı yapıştırın, gerisini {brand} halletsin — sıfır teknik bilgi.",
    "İndirme geçmişiniz tarayıcınızda kalır; istediğiniz formatta yeniden indirebilirsiniz.",
    "Açık ve sade arayüz; ne yapacağınızı düşünmenize gerek kalmaz.",
  ],

  safetyHeadings: [
    "Güvenli ve yasal mı?",
    "Gizlilik ve güvenlik",
    "Dikkat edilmesi gerekenler",
    "Sorumlu kullanım",
  ],
  safetyBodies: [
    "{brand} dosyalarınızı saklamaz. İndirme için hazırlanan her dosya en geç bir saat içinde sunuculardan otomatik olarak silinir; arkada iz kalmaz.",
    "Yalnızca sahibi olduğunuz veya indirme izniniz bulunan içerikleri indirin. Her platformun hizmet şartlarına uymak kullanıcının sorumluluğundadır.",
    "İndirdiğiniz içeriği kişisel kullanım, arşivleme veya çevrimdışı izleme dışında telif hakkını ihlal edecek şekilde kullanmamaya özen gösterin.",
    "Tüm işlem şifreli bağlantı (HTTPS) üzerinden yürür. {brand} sizden parola, ödeme bilgisi veya kişisel veri istemez.",
    "Hesap açmadığınız için geride kişisel veri bırakmazsınız. İndirme geçmişiniz yalnızca kendi tarayıcınızda, bir saatliğine tutulur.",
    "Sahte 'virüs temizleyici' veya 'sürücü güncelleyici' pencereleri görürseniz bilin ki onlar {brand}'a ait değildir; biz tek bir indirme bağlantısı veririz, o kadar.",
  ],

  faqs: [
    {
      q: "{Keyword} gerçekten ücretsiz mi?",
      a: "Evet. {brand} ile {keyword} tamamen ücretsizdir; herhangi bir abonelik, kredi kartı veya gizli ücret yoktur.",
    },
    {
      q: "Hesap açmam gerekiyor mu?",
      a: "Hayır. Üyelik, giriş veya e-posta gerekmez. Bağlantıyı yapıştırıp doğrudan indirebilirsiniz.",
    },
    {
      q: "Hangi formatları indirebilirim?",
      a: "1080p'ye kadar MP4 video ya da MP3, WAV ve M4A ses formatları. Seçimi indirmeden önce yaparsınız.",
    },
    {
      q: "İndirdiğim dosyalar sizde saklanıyor mu?",
      a: "Hayır. Hazırlanan dosyalar en geç 1 saat içinde sunucularımızdan otomatik silinir.",
    },
    {
      q: "Telefonda da çalışıyor mu?",
      a: "Evet. {brand} tarayıcı tabanlıdır; Android, iPhone, tablet ve bilgisayarda aynı şekilde çalışır.",
    },
    {
      q: "Uygulama veya eklenti kurmam gerekir mi?",
      a: "Hayır. Hiçbir kurulum gerekmez — her şey tarayıcınızın içinde olur.",
    },
    {
      q: "Bağlantıyı her seferinde yapıştırmak yerine daha hızlı bir yol var mı?",
      a: "Evet. {platform} adresindeki alana 'sentroy' ekleyin; örneğin youtube.com yerine {domain} yazdığınızda doğrudan indirme sayfasına gelirsiniz.",
    },
    {
      q: "İndirme neden birkaç saniye sürüyor?",
      a: "Dosya, istediğiniz kalitede sunucularımızda hazırlanır. Bu işlem genelde birkaç saniyedir; ardından indirme anında başlar.",
    },
    {
      q: "Aynı videoyu farklı bir formatta tekrar indirebilir miyim?",
      a: "Evet. İndirme geçmişiniz tarayıcınızda bir saat tutulur; oradan dilediğiniz içeriği farklı bir formatta yeniden indirebilirsiniz.",
    },
  ],

  ctaHeading: [
    "Hemen deneyin",
    "{Keyword} için hazır mısınız?",
    "Bağlantıyı yapıştırın, gerisini bize bırakın",
    "Saniyeler içinde indirin",
  ],
  ctaBody: [
    "Bir {platform} bağlantısı kopyalayın ve aşağıdaki kutuya yapıştırın — {keyword} bundan kolay olamaz.",
    "Üyelik yok, kurulum yok. Linki yapıştırın, formatı seçin, indirin.",
    "Şimdi {brand} ile ücretsiz deneyin; sonucu saniyeler içinde göreceksiniz.",
    "Aklınızdaki videoyu açın, bağlantısını alın ve {domain} üzerinde indirmeye başlayın.",
  ],
  ctaButton: [
    "Şimdi indir",
    "Ücretsiz dene",
    "İndirmeye başla",
    "Bağlantıyı yapıştır",
  ],

  metaTitleSuffix: [
    "{Keyword} — Ücretsiz, Hızlı, Üyeliksiz | {brand}",
    "{Keyword} | {platform} İndirici — {brand}",
    "{Keyword}: En Kolay Yol | {brand}",
    "{Keyword} (MP4 & MP3) — {brand} ile Ücretsiz",
  ],
  metaDescription: [
    "{Keyword} mi arıyorsunuz? {brand} ile bağlantıyı yapıştırın, MP4 video veya MP3 sesi saniyeler içinde indirin. Ücretsiz, hızlı, üyelik gerektirmez.",
    "{platform} içeriğini indirmenin en kolay yolu: {keyword} için linki yapıştırın, kaliteyi seçin, indirin. Kurulum ve hesap yok.",
    "{Keyword} işlemini ücretsiz ve hızlıca yapın. {brand} 1080p'ye kadar MP4 ve MP3/WAV/M4A ses destekler — tamamen tarayıcı üzerinden.",
    "{brand} ile {keyword}: reklam tuzağı yok, üyelik yok, gizli ücret yok. Bağlantıyı yapıştırın ve saniyeler içinde dosyanıza kavuşun.",
  ],
}
