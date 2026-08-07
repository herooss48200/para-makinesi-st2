# AGROS ST2 v6.13.5-R12 — R10→R12 Teknik Audit

## Kök neden
R8/R10 market-data startup zinciri, `sniperMumlar` içinde yeterli sayıda ham 1m mum varsa bunu Golden Renko giriş kapısı için "onay hazır" sayıyordu.
Bu doğru değildi. Gerçek giriş yetkisi ham 1m mum SuperTrend'i değil, 1m mumlardan ATR kutusu ile üretilen Renko tuğlaları üzerindeki SuperTrend'i kullanır.
80 kapanmış 1m mum bazı sembollerde SuperTrend(10) için gereken en az 12 Renko tuğlasını üretmiyordu. Buna rağmen Entry Gate ham cache sayısı üzerinden READY olabiliyordu.

## R12 düzeltmesi
- Entry Gate artık ham `sniperMumlar` sayısına değil, gerçek ATR-Renko + SuperTrend UP/DOWN readiness sayısına bakar.
- İlk 80 mumda Renko-ST oluşmayan semboller için yalnız o sembollerde 240 mum, gerekirse 480 mum derin onarım yapılır.
- Strateji değişmez: raw 1m SuperTrend fallback eklenmedi; ATR/box veya ST parametreleri gevşetilmedi.
- Derin onarım gerektiren sembol sonraki refresh'te gerekli tarihçe derinliğini korur.
- `72_st2_renko_entry.js`, aynı son kapanmış 1m mum için market-data katmanında önceden hesaplanan Renko-ST cache'ini kullanır.
- Panel artık `1m Veri` ile `1m Renko ST` readiness'i ayırır.
- Panelde Entry Funnel görünür: değerlendirilen pusu, fiyat uygun, 1m ST uygun, birlikte uygun, emir, fiyat/ST bekleyen.

## Korunanlar
- R11 30 saniyelik Telegram live-panel scheduler
- Latest-only Telegram panel worker ve bounded retry
- R8 pre-R5 known-good network motoru
- DIRECT / CONFIRMED Entry Mode Policy
- Entry Evolution
- 15m Golden Renko pattern/Bollinger matematiği
- Williams %R shadow
- gerçek emir, stop, profit-floor, exit ve Restart-GAP matematiği

## Test kanıtı
- `npm test` (hızlı kritik suite): PASS
- `test_v6145_1m_renko_st_readiness.js`: PASS
- `test_v6144_live_panel_runtime_cadence.js`: PASS
- `test_v6143_telegram_live_panel_delivery_truth.js`: PASS
- `test_v6141_market_data_known_good_rollback.js`: PASS
- `test_v6140_market_data_transport_stability.js`: PASS
- `test_v6110_golden_live_chain.js`: PASS
- `test_v610_real_order_execution_safety.js`: PASS
- `test_v674_full_source_syntax.js`: 153 JS PASS
