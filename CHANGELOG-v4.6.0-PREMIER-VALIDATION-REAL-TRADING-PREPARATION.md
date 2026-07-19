# AGROS v4.6.0 — Premier Validation & Real Trading Preparation

## Amaç
2000+ sanal işlemle öğrenilmiş DNA ve Exit bilgisini kaybetmeden, gerçek emir öncesinde hangi DNA + Exit eşleşmelerinin matematiksel olarak doğrulandığını açıklanabilir ve denetlenebilir hale getirmek.

## Değişiklikler
- 256 temel DNA için kalıcı, artan ve çakışmasız `DNA #ID` kayıt defteri eklendi.
- Yeni DNA, Strategy Signature oluşturulduğu anda otomatik olarak sıradaki ID'yi alır; eski DNA ID'leri değişmez.
- Kimlik defteri atomik ana dosya, sağlam yedek, canlı süreç denetimli kilit ve append-only günlük ile korunur; yarım yazma/bozuk ana dosya sonrasında ID tekrar kullanımı engellenir.
- Strategy Lab, Premier League, DNA Kimlik Kartı, dinamik/Elite Exit, Premier gözlem kasası, açılış, kapanış ve BlackBox aynı merkezi ID'yi kullanır. ID öncesinden kalan gözlem kovaları rapor anında otomatik tamamlanır.
- Premier League 2.0 zorunlu kapıları `N >= 5`, `PF > 1`, `Net > 0`, `Expectancy > 0` ve güvenlik amacıyla ölüm riski bulunmaması olarak tek doğruluk kaynağına bağlandı.
- Her Premier, Championship, Development ve Historical kararı gerekçeli hale getirildi.
- Premier dışında kalan güçlü DNA'lar için Kayıp Şampiyon Denetimi eklendi.
- Güncel rejimde kullanılan Aktif Exit ile tüm zamanların Elite Exit'i ayrı tutuldu; tüm-zaman Elite seçiminde aynı ID'nin temel DNA agregası ayrıntılı TF/BB kırılımına göre önceliklendirildi.
- “Bugün gerçek emir açsam hangi DNA'ları kullanırım?” sorusuna fail-closed, kanıtlı hazırlık raporu eklendi.

## Korunan Sınırlar
- Trade Engine strateji mantığı değiştirilmedi.
- Yeni laboratuvar/analiz motoru eklenmedi.
- Mevcut öğrenilmiş veri dosyaları sıfırlanmadı veya yeniden yazılmadı.
- Gerçek emir yetkilendirmesi varsayılan olarak kapalı kaldı.
