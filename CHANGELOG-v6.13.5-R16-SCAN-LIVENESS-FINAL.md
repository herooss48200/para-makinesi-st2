# AGROS ST2 v6.13.5-R16 — Scan Liveness Final

## Canlı kök neden
R16 canlıda startup gate'i %95 üzeri readiness ile açmasına rağmen ilk `ST2 RENKO AUDIT` tamamlanmıyordu. Canlı logdaki `W%R SHADOW EVENT` satırlarının gelmesi, `taraVeDegerlendir()` 200-sembol döngüsünün gerçekten başladığını kanıtladı.

Kaynak incelemesinde Williams shadow `update()` fonksiyonunun her anlamlı sembol güncellemesinde tüm state JSON'unu `writeFileSync + renameSync` ile yeniden yazdığı görüldü. İlk 200-sembol taramasında bu yüzlerce senkron disk yazımına dönüşebiliyordu. Ayrıca ilk tarama sonunda açılış pusu Telegram özeti `await` edildiği için Telegram erişim sorunu tarama dönüşünü geciktirebiliyordu.

## Düzeltme
- `88_st2_williams_cycle_shadow_lab.js`
  - `update(..., {persist:false})` ile RAM-only toplama desteği.
  - `flush()` ve dedupe `scheduleFlush()` ile tek atomik state yazımı.
  - Williams shadow öğrenmesi ve ledger kapanış davranışı korunur.
- `72_st2_renko_entry.js`
  - 200-sembol taramasında Williams per-symbol disk I/O kaldırıldı.
  - Audit üretildikten sonra tek arka-plan Williams flush planlanır.
  - Açılış pusu Telegram özeti `setImmediate` arka-plan görevine taşındı; Renko audit ve ilk tarama dönüşünü bloke etmez.
- Entry Evolution, DIRECT/CONFIRMED Mode Policy, gerçek emir, stop/profit-floor/exit matematiği değişmedi.

## Regresyon kanıtı
Yeni `test_v6151_renko_scan_io_liveness.js`:
- 200 Williams update sırasında 0 state write / 0 rename,
- tarama sonrası 1 write / 1 atomic rename,
- ikinci flush no-op,
- startup pusu Telegram'ın arka-plan görevinde olduğunu doğrular.
