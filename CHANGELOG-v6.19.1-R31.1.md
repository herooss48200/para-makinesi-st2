# AGROS ST2 v6.19.1-R31.1 — 15M STABLE / ONUR GUARD / CRITICAL TELEGRAM

## Amaç
R31'in canlı MTF entry karmaşasını kaldırıp gerçek emir kaynağını tekrar tek hatta toplamak; Onur final yön filtresini güvenli gerçek-emir kapısına taşımak; restart mutabakat tazeliğini gerçek çalışma süresine uyarlamak; açılış/kapanış Telegram bildirimlerini panel hattından bağımsız kritik teslim hattına almak.

## Canlı mimari
- Gerçek entry kaynak TF: **15m yalnız**.
- 1m: yalnız **Renko SuperTrend teyidi**.
- 30m / 1h / 2h / 4h: gerçek Renko entry taramasında **aktif değil**.
- Higher-TF aggregation helper'ları geçmiş kayıt/rollback uyumluluğu için kodda durur ancak canlı entry listesine dahil değildir.
- Premier/N5 kimliğini besleyen BlackBox context TF'leri değiştirilmedi; geçmiş DNA/LAB kimliği kırılmadı.

## Onur final yön filtresi
- Yeni modül: `98_st2_final_direction_guard.js`.
- Ağ çağrısı yapmaz; mevcut kapanmış 15m cache'i kullanır.
- EMA50 / EMA200, sideways eşiği %0.10.
- **SHORT HARD VETO:** BTC UP + ETH UP + BTC gap >= %1 + ETH gap >= %1.
- Veto, `SUBMITTED` kaydı ve Binance MARKET emrinden **önce** çalışır.
- Veri yetersizse fail-open.
- LONG için yalnız shadow: BTC UP değilse `wouldVeto` kaydı tutulur, gerçek LONG engellenmez.
- Panelde SHORT veto/keep, LONG shadow-veto ve data fail-open sayaçları görünür.

## 41 gerçek işlem replay etkisi
- Ham: 41 işlem, 24W/17L, Net yaklaşık -0.0053 USDT.
- Guard veto: 11 işlem; 10 zarar / 1 kazanan.
- Veto edilen net toplam yaklaşık -4.2574 USDT.
- Guard sonrası yaklaşık 30 işlem, 23W/7L, WR %76.7, Net +4.2521 USDT.
- Bu replay/holdout kanıtıdır; canlı veto sayacı bu sürümde ayrıca görünür hale getirilmiştir.

## Telegram
- Gerçek pozisyon **açılış** mesajı `telegramMesajGonderKritikTeslim` hattına taşındı.
- Gerçek pozisyon **kapanış** mesajı `telegramMesajGonderKritikTeslim` hattına taşındı.
- Panel ayrı direct hattını kullanmaya devam eder.
- Açılış/kapanış teslim sonucu konsolda açıkça `TESLİM` / `TESLİM DOĞRULANAMADI` olarak loglanır.
- Kapanış kritik rapor teslimi başarısızsa close-lifecycle bunu rapor hatası olarak görünür kaydeder; gerçek pozisyon kapanış commit'i geri alınmaz.

## Startup / reconciliation
- `st2ExchangeReconcileFreshMs`: 15,000 -> **180,000 ms**.
- Gözlenen full restart reconciliation süresi yaklaşık 109 saniye olduğundan 15 saniyelik freshness kendi başarılı mutabakatını sürekli STALE yapıyordu.
- Fail-closed güvenliği korunur.

## Startup veri yükü
- `renkoKaynakMumLimiti`: 800 -> **260**.
- R31'deki 800 mum, 4h aggregation için gerekliydi. Canlı entry artık yalnız 15m olduğu için 260 mum EMA200 + Renko/BB/ATR için yeterli marjı korur ve startup yükünü azaltır.

## Panel
- `MTF tarama` yerine `Renko tarama`.
- Yalnız aktif canlı TF (15m) sayaçta gösterilir.
- Canlı zincir: `15m ATR-Renko/BB -> CONFIRMED -> 1m Renko ST -> Premier/N5 -> Onur Guard -> REAL`.
- Kritik Telegram delivered/failed sayacı panelde görünür.

## Test
`npm test` zinciri:
- R31.1 15m stable / Onur / Telegram regression
- R31 compatibility helper test
- R30 CORE
- R26 percent stop
- R26 startup isolation
- R26 phased startup
- R30 Renko-only 20 slot

Tümü PASS.
