# AGROS ST2 v6.13.5-R22 — 15M CONFIRMED BOOTSTRAP + LIVE EVIDENCE FINAL

## Amaç
R21 ile düzeltilen gerçek CONFIRMED zaman otoritesini (pusu sonrası kapanmış 15m Renko dönüşü + 15m offset + 1m Renko ST son teyidi) mode seçim kanıtında da doğru timeframe'e taşımak ve ağır Global Historical işinin canlı trade process'ini tekrar kilitlemesini önlemek.

## Değişiklikler
- `LEGACY_1M_SHADOW` artık gerçek DIRECT/CONFIRMED mode seçimine **yetki vermez**; yalnız tanısal hint olarak korunur.
- Yeni `94_st2_15m_confirmed_evidence.js` küçük ve kalıcı evidence state'i tutar:
  - `DIRECT|YON|PATTERN|OFFSET`
  - `CONFIRMED|YON|PATTERN|OFFSET`
  - bootstrap ve canlı sonuçlar ayrı tutulur, seçimde kontrollü birleşir.
- Yeni `scripts_st2_15m_confirmed_bootstrap.js` **PM2 trade process dışında** çalışır. Mevcut `st2-historical-training-ledger.jsonl` sinyallerini ve Binance 15m mumlarını kullanarak 0.25T/0.50T/0.75T DIRECT ve gerçek 15m-CONFIRMED adaylarını aynı standardize exit modeliyle replay eder.
- Bootstrap 1m Renko ST'yi modellemez; bu açıkça metadata'da `exact1mStModeled:false` olarak işaretlenir. Gerçek girişte 1m Renko ST zorunluluğu değişmez. DIRECT ve CONFIRMED bootstrap karşılaştırması aynı standardize model üzerinde yapılır; canlı kapanışlar zamanla bootstrap prior'unu devralır.
- Bootstrap'ın sonsuza kadar baskın kalmasını önlemek için efektif ağırlığı varsayılan `N30` ile sınırlandırılır (`renkoGiris15mBootstrapMaksAgirlik`).
- CONFIRMED seçim kapısı:
  - N >= 15
  - WR >= %75
  - PF > 1
  - Expectancy > 0
  - Net > 0
  - karşılaştırılabilir DIRECT N >= 15 ise CONFIRMED WR avantajı >= 2 puan ve Expectancy avantajı >= 0.
- Canlı bilimsel kapanışlar (manuel dış kapanış ve Restart-GAP hariç) evidence state'e non-blocking kaydedilir. CONFIRMED canlı örneği yalnız `CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET_1M_ST` otoritesine sahip R21+ girişlerden kabul edilir.
- `79_st2_global_historical_runtime.js` canlı trade process içinde varsayılan **OFF** olur. Eski Global Historical runtime yalnız `AGROS_ST2_GLOBAL_HISTORICAL_RUNTIME=true` açıkça verilirse çalışabilir.
- Global Historical train sonrasında ağır `reconciliation.summary()` artık ana bot process içinde otomatik çağrılmaz.

## Değişmeyenler
- R21 15m CONFIRMED zamanlama otoritesi.
- 1m Renko ST son sniper teyidi.
- Premier/Shadow gate ve Binance gerçek emir güvenlik zinciri.
- Renko çıkış / kâr koruma matematiği.
- State/ledger/GAP/restart koruması.
- Telegram 30sn edit / 3dk yeni panel davranışı.

## Veri güvenliği
Bu paket `data/`, `.env`, `logs-st2/`, `.git/`, `node_modules/` içermez ve mevcut state/ledger'ı silmez.

## Corrected package v2
- R22 runtime code is unchanged from the first R22 package.
- Legacy regression tests whose version contract still expected R21 were updated to R22.
- `test_v6134_unified_entry_mode_live_gate.js` now mocks the new `94_st2_15m_confirmed_evidence.js` dependency.
- This packaging correction fixes the initial `test_v6142_startup_panel_guard.js` version assertion failure.
