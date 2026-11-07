# UYAP ZIP İndirici

UYAP Vatandaş portalında açılan davanın tüm evraklarını indirir ve UYAP'taki klasör yapısıyla tek ZIP verir.

- 15 eş zamanlı indirme; her yeni indirme bir öncekinin başlamasından en az 3 sn sonra başlar, 15 sabit tutulur.
- Adres: `/main/jsp/download_document_brd.uyap` (asıl biçim: udf/pdf/tif). Görüntüleme adresi büyük evrakta dosya yerine uyarı yazısı döndürdüğü için kullanılmaz.
- Aynı evrak birden çok klasörde görünürse ("Dosyaya Eklenen Son 20 Evrak") her klasöre konur, UYAP'tan bir kez indirilir.
- İnemeyen evrak `_INDIRILEMEYENLER.txt` içinde listelenir.

## Kurulum

Chrome → `chrome://extensions` → Geliştirici modu → **Paketlenmemiş öğe yükle** → bu klasör.

## Kullanım

vatandas.uyap.gov.tr → Dosya Sorgulama → davada **Dosya Görüntüle** → **Evrak** sekmesi. İndirme kendiliğinden başlar (sağ alttaki panelden kapatılabilir).

## Test

`node test_zip.mjs` (Python gerekir): ZIP yazıcısını Türkçe adlar ve iç içe klasörlerle doğrular.

Canlı kabul (7 Kasım 2026): Ödemiş İcra Hukuk 2024/109, 122 evrak, 0 hata, 355 sn; ZIP `testzip` temiz, dosya imzaları uzantılarla uyumlu.
