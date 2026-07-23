# AGROS ST1 v5.3.2 — DNA Stop Evolution

## Amaç
Her LAB/DNA kimliğinin Stop seviyesini Exit öğrenmesi gibi kendi fiyat yolu üzerinde paralel öğrenmesi ve yeterli kanıtta otomatik uygulaması.

## Değişiklikler
- Stop otomatik atama eşiği 50 kapanıştan 5 karşılaştırılabilir kapanışa düşürüldü.
- Stop ve BE kanıt eşikleri ayrıldı; BE eşiği 50 olarak korundu.
- Stop kataloğu genişletildi: %0.8, %1.0, %1.2, %1.5, %1.8, %2.1, %2.4.
- Öğrenme LAB/DNA kimliği bazında ayrı state altında tutulur.
- Seçilen Stop yeni pozisyon açılışında otomatik uygulanır; açık pozisyonun Stop'u geriye dönük değiştirilmez.
- Stop değişim geçmişi (eski/yeni, N, Net, PF, Expectancy, neden) saklanır.
- Restart-GAP ve yetersiz fiyat yolu öğrenme dışında kalır.
- Başlangıç sürüm banner'ı v5.3.2 ile eşitlendi.

## Korunan sınırlar
- Trade Engine giriş stratejisi değiştirilmedi.
- Mevcut %1.5 varsayılan Stop fallback olarak korundu.
- BE öğrenmesi ve eşiği değiştirilmedi.
- Eski state dosyaları geriye uyumlu okunur.
