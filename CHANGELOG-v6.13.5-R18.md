# AGROS ST2 v6.13.5-R18 — NONBLOCKING CONTROL PLANE FINAL

Base: v6.13.5-R17 commit `a5e2cc3`.

## Canlıda doğrulanan R17 kalan arızası
- Startup hazırdı: 200/200 mum, 200/200 1m Renko ST, fiyat 200/200.
- Buna rağmen ana döngü `EXCHANGE_RECONCILIATION` aşamasında ~80 saniye bekledi.
- Sonuç: `FIRST_SCAN_PENDING`, Renko tarama `0/200`, pusu/huni `0`, Telegram paneli uzun aralıklarla geldi.

## R18 düzeltmesi
1. Signed Binance gerçek-pozisyon mutabakatı ana Renko/pusu döngüsünden ayrıldı ve background control-plane worker'a taşındı.
2. Mutabakat takılsa bile Renko taraması ve pusu üretimi devam eder.
3. Gerçek Binance emir yetkisi fail-closed kaldı: yalnız taze exchange reconciliation + doğrulanmış network fiyatı birlikte varsa gerçek emir açılır.
4. Gerçek stop/trail ilerletme de yalnız network fiyatı + taze mutabakat birlikte doğrulanmışsa yapılır; aksi halde mevcut Binance koruma emirleri korunur ve ilerletme ertelenir.
5. İlk Renko taraması gerçek pozisyon olsa bile closed-1m fallback ile reconciliation beklemeden tamamlanabilir; fallback ile gerçek emir verilmez.
6. Telegram Native IPv4 isteğine socket timeout'tan bağımsız wall-clock hard deadline eklendi; DNS/connect/Agent beklemesi panel worker'ını dakikalarca kilitleyemez.
7. Operasyon paneline `Control Plane Mutabakat` ve `Gerçek Entry READY/FAIL-CLOSED` görünürlüğü eklendi.
8. Strateji matematiği, Golden Renko pattern/BB, Entry Evolution, DIRECT/CONFIRMED seçim matematiği, Premier/Shadow puanlaması, profit-floor/Renko trail ve Williams shadow matematiği değiştirilmedi.

## Canlı kabul kriteri
- `Son Renko tarama` artık `0/200` kalmamalı; ilk tarama tamamlanmalı ve sonraki taramalar ilerlemeli.
- `Giriş hunisi Değerlendirilen` canlı taramalarda güncellenmeli.
- Telegram panel cadence'i yaklaşık 30 sn olmalı; ağ problemi varsa hard-timeout/circuit görünür olmalı fakat worker dakikalarca kilitlenmemeli.
- Exchange mutabakatı stale ise panel `Gerçek Entry FAIL-CLOSED/...` göstermeli; buna rağmen Renko/pusu taraması devam etmeli.
- Binance gerçek pozisyon sayısı state ile mutabakat başarılı olduğunda eşitlenmeli.
