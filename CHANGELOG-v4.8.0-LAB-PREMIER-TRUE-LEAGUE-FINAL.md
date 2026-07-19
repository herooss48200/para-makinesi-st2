# AGROS v4.8.0 — LAB Premier True League Final

- Family DNA'nın emir/üst katman yetkisi kaldırıldı; 512 Family yalnız kalıcı piyasa hafızası ve audit katmanıdır.
- Gerçek lig yarışmacısı LAB DNA oldu.
- Tarihsel olarak güçlü ve kendi LAB Exit'i pozitif olan LAB'lar geniş sanal testte LAB Premier'e girer.
- Beş ileri pozitif kapanış LAB'ı `FORWARD_VERIFIED` seviyesine yükseltir; bu eşik tek ayarla zorunlu yapılabilir.
- LAB Premier işlemleri kendi doğrulanmış Exit'iyle açılışta dondurulur.
- Bütün LAB Premier işlemleri eşit `x1` sanal boyutla yarışır; Championship `x0` gölge öğrenmedir. Eski Family `1/0.25` kuralı kaldırıldı.
- Tek strateji sinyali ve tek sanal pozisyon korunur; ikinci emir oluşturulmaz.
- LAB Premier için ayrı, temiz test kasası ve Telegram raporu eklendi.
- Eski Family Premier/Championship, Premier Observation ve Adaptive League Telegram çakışmaları kapatıldı; hesapları arşiv/audit için korunur.
- DNA kartları `Family DNA Hafıza Kartları` olarak yeniden adlandırıldı.
- Gerçek emir yetkisi fail-closed kalır.
