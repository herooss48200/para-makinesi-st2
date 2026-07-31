# AGROS ST2 v6.9.0 — FINAL PREMIER SCORE + 200 COIN

Yayın tarihi: 31.07.2026
Temel: v6.8.4 (`e748ce1`)

## Final kapsam

- İzlenen USDT perpetual evreni 100 coinden 200 coine çıkarıldı.
- Premier seçiminde katı pozitif/negatif eleme yerine açıklanabilir kalite puanı ve göreceli sıralama eklendi.
- Premier Score bileşenleri:
  - Tarihsel Profit Factor: %18
  - Tarihsel Expectancy: %17
  - Canlı form: %20
  - Entry Evolution: %15
  - Takeover Replay: %15
  - Örnek güveni: %15
- Güvenlik tabanı korundu: exact-context, tamamlanmış tarihsel havuz ve minimum örnek şartı sağlanmadan Premier seçilemez.
- Canlı LAB formu bağımsız terfi/düşürme kapısı olmaktan çıkarıldı; Premier Score'a sınırlı ve denetlenebilir ±8 puan düzeltmesi olarak bağlandı.
- Premier/Shadow kararında puan, eşik, göreceli sıra, bileşenler ve kesin gerekçe görünür hale getirildi.
- Replay raporları Entry Replay, Exit Replay ve Takeover Replay olarak ayrıldı.
- Replay üretilemediğinde kesin neden raporlanır: `PRICE_PATH_MISSING`, `EXIT_REPLAY_ENGINE_RETURNED_NULL`, `EXIT_REPLAY_SELECTION_VALIDATION_NOT_AVAILABLE`, `RESTART_GAP_SCIENTIFICALLY_EXCLUDED`, `MANUAL_EXTERNAL_CLOSE_SCIENTIFICALLY_EXCLUDED`.
- Kapanış raporunda `Exit FALLBACK N0` ile `Takeover Replay N...` ayrı kanıtlar olarak gösterilir.
- Telegram operasyon paneline evren büyüklüğü, evren yükleme süresi, mum/SuperTrend hazırlığı, tarama süresi, eksik veri ve veri sağlığı eklendi.
- Yeni v6.9.0 regresyon testi eklendi; eski v6.7.2–v6.8.4 testleri korunarak çalıştırıldı.

## Değişmeyen kritik alanlar

- Trade Engine matematiği
- Giriş fiyatı ve Renko tetik matematiği
- Stop ve BE matematiği
- MFE Capture ve ATR Takeover matematiği
- Entry/Exit Evolution kayıt formatı ve mevcut öğrenme verileri
- Restart-GAP bilimsel izolasyonu
- Gerçek emir fail-closed güvenliği

## Dağıtım ilkesi

Final temiz tam sürüm ZIP'inde yalnız çalışma ve doğrulama için gerekli kaynak, test, paket ve güncel v6.9.0 belgeleri bulunur. `.env`, `.git`, `node_modules`, `data`, state/ledger, log, backup, replay çıktısı ve geçici klasörler bulunmaz.
