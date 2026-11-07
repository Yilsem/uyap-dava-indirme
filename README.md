# UYAP Dava İndirme

UYAP Vatandaş Portalı'ndaki davalarınızın tüm evraklarını, UYAP'ta gördüğünüz klasör yapısıyla tek ZIP dosyası olarak indiren ücretsiz Chrome eklentisi.

- **Tek dava:** Davanın **Evrak** sekmesini açın, indirme kendiliğinden başlar ve bitince ZIP iner.
- **Tüm davalarınız:** Sorgulama İşlemleri › Dosya Sorgulama sayfasında **Tüm davalarımı indir**'e basın. Eklenti her yargı türünü (Ceza, Hukuk, İcra, İdari Yargı…) sorgular ve her davayı ayrı ZIP olarak indirir. Sonunda hangi davanın tam indiğini gösteren `UYAP_indirme_raporu.txt` gelir.
- Tam inen davaları hatırlar. Yeniden başlatırsanız onları atlar, kaldığı yerden devam eder.
- Oturumunuz kapanırsa durur. Yeniden giriş yapıp tekrar başlatmanız yeterli.

## ZIP'in içi

UYAP'taki ağacın aynısıdır: `Dosyaya Eklenen Son 20 Evrak`, `Tüm Evraklar › <dosya> › <evrak türü>`. Ekler, ana evrakla aynı adlı klasörün içindedir. Evraklar UYAP'taki asıl biçimiyle iner (udf, pdf, tif). Windows dosya adında `/` olamayacağı için tarihlerde `-` kullanılır. İnemeyen evrak olursa ZIP içinde `_INDIRILEMEYENLER.txt` dosyasında listelenir.

## Kurulum

1. Bu depoyu indirin (Code › Download ZIP) ve bir klasöre açın.
2. Chrome'da `chrome://extensions` sayfasını açın, sağ üstten **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle**'ye basıp klasörü seçin.
4. vatandas.uyap.gov.tr'ye e-Devlet ile girin.

Chrome "bu site birden fazla dosya indirmek istiyor" diye sorarsa **İzin ver** deyin.

## Gizlilik

Eklenti yalnız `vatandas.uyap.gov.tr` sayfasında, sizin açık oturumunuzla çalışır. Evraklar doğrudan UYAP'tan sizin bilgisayarınıza iner. Hiçbir veri başka bir sunucuya gönderilmez. Eklentide şifre, analiz ya da takip kodu yoktur. Kod açıktır; `content.js` ve `zip.js` dosyalarını okuyabilirsiniz.

## Hız

Aynı anda en çok 20 evrak iner ve her yeni indirme bir öncekinin başlamasından en az 0,2 saniye sonra başlar. UYAP hata döndürürse aralık kendiliğinden 3 saniyeye kadar açılır, hatalar bitince yeniden kısalır. Sekme arka plandayken de hız düşmez. Bu ayarlar `content.js` dosyasının başında yer alır (`ESZAMANLI`, `BASLATMA_ARASI_MS`, `EN_YAVAS_ARA_MS`).

## Teknik

- İndirme adresi: `/main/jsp/download_document_brd.uyap?evrakId=&dosyaId=&yargiTuru=`. Görüntüleme adresi (`view_document_brd`) büyük evrakta dosya yerine uyarı yazısı döndürdüğü için kullanılmaz.
- Davanın kimliği sayfadaki `window.dosya_bilgileri` değişkeninden alınır; eklenti bu yüzden sayfanın kendi ortamında (`"world": "MAIN"`) çalışır.
- ZIP, bağımlılığı olmayan küçük bir yazıcıyla (`zip.js`, sıkıştırmasız) tarayıcıda oluşturulur. Zip64 desteği olmadığı için tek ZIP en çok 4 GB olabilir.

## Test

`node test_zip.mjs` (Python gerekir): ZIP yazıcısını Türkçe adlar ve iç içe klasörlerle doğrular.

## Lisans

MIT. Bu eklentinin Adalet Bakanlığı ya da UYAP ile resmî bir bağı yoktur.
