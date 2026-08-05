# AGROS ST2 v6.12.2 FINAL — Golden Renko & Williams %R Shadow

## Golden Renko girişi geri getirildi

- Entry Evolution yeniden canlı/sanal giriş fiyat yetkisidir.
- Her pattern, state içindeki öğrenilmiş aktif seviyesini kullanır.
- Yeni veya öğrenilmemiş pattern varsayılanı **0.75T** olarak korunur.
- Aday seviyeler: `0.25T, 0.50T, 0.75T, 1.00T, 1.25T, 1.50T`.
- Entry kararı pusu oluşumunda dondurulur; tetik, Premier değerlendirmesi ve pozisyon kaydı aynı seviyeyi kullanır.
- Fiyat seçilmiş seviyenin uygun tarafında kaldığı sürece yeni bir yeniden-kesişim aranmaz.
- Aynı yönlü **1m Renko SuperTrend** giriş şartı olarak korunur.
- Pusu ömrü yeniden üç kapanmış Renko tuğlası ile ölçülür.

## ST1 ve referans kırılımı

- ST1 15m normal mum pususu hard gate olmaktan çıkarıldı.
- ST1 3m SuperTrend hard gate olmaktan çıkarıldı.
- ST1 hedef kırılımı ve referans 0T taze yeniden kırılım şartı kaldırıldı.
- ST1 değerlendirmesi yalnız `SHADOW_ONLY` bağlam etiketi olarak saklanır ve emri engellemez.

## Premier

- Premier kalite puanı ve kalibrasyon matematiği değiştirilmedi.
- Premier sinyaller gerçek emir adayı olmaya devam eder.
- Premier tarafından seçilmeyen geçerli Golden Renko sinyalleri canlı Shadow olarak izlenir.
- Premier ve Shadow sonuçları mevcut raporlarda ayrı karşılaştırılabilir.

## Başlangıç verisi

- ST2 hazır kapısı 15m Renko kaynak verisi ile 1m Renko onay verisini bekler.
- ST1 3m veri hazırlığı arka planda shadow/audit amacıyla devam eder.

## Williams %R Cycle Shadow Lab

- W%R(14), kapanmış 15m ATR-Renko tuğlalarında hesaplanır.
- Tepe bölgesi: `-10..0`.
- Dip bölgesi: `-100..-90`.
- Ayrı ziyaretler T1/T2/T3+ ve D1/D2/D3+ olarak sayılır.
- LONG etiketi: önceki tepe sayısı + mevcut dip sayısı.
- SHORT etiketi: önceki dip sayısı + mevcut tepe sayısı.
- Williams hiçbir emri açmaz, engellemez veya Premier kararını değiştirmez.
- State geçişleri restart için kalıcıdır.
- Kapanış kayıtlarında tradeId tabanlı duplicate koruması vardır.

## Değişmeyen güvenlik zinciri

- Binance gerçek emir fail-closed kontrolleri ve iki gerçek slot.
- İlk stop, doğrudan kâr tabanı, Renko takeover, frozen trail.
- MFE Capture, Exit Evolution, kapanış muhasebesi ve restart korumaları.


## FINAL R2
- Windows CRLF nedeniyle yanlış negatif veren `test_v6110_golden_live_chain.js` assertionı satır sonu ve girintiden bağımsız regex kontrolüne çevrildi.
- Üretim stratejisi ve çalışma zamanı kodunda ek değişiklik yapılmadı.
