# AGROS ST2 v6.13.5-R15 — DEDICATED TICKER & STARTUP ISOLATION

## Canlı kanıt
R14, FUTURES_PRICES çağrısındaki sonsuz beklemeyi hard deadline ile kesti.
Canlıda `FUTURES_PRICES:HARD_TIMEOUT:6000ms` görüldü; böylece 211–439 saniyelik askıda kalma bitti.
Ancak global ticker yine aynı shared keep-alive Agent/queue yolunu kullandığı için ilk Renko auditine geçilemedi.

## R15 düzeltmesi
- `binanceFiyatlariCek()` shared KLINE kuyruğu ve shared Agent'tan tamamen ayrıldı.
- Global ticker için tek soketli dedicated keep-alive Agent eklendi.
- Dedicated ticker yine wall-clock hard deadline ve retry=0 kullanır.
- ST2 startup sırasında Entry Gate hazır değilse ve açık pozisyon yoksa FUTURES_PRICES hiç çağrılmaz.
- Açık pozisyon varsa koruma amacıyla dedicated ticker çalışmaya devam eder.
- Gate READY sonrası ana giriş döngüsü dedicated ticker -> position protection -> Renko scan sırasıyla ilerler.
- 15m/1m toplu core refresh ve ST1 shadow yine ilk gerçek Renko auditinden sonra başlar.

## Değişmeyenler
- Entry Evolution
- DIRECT / CONFIRMED Entry Mode Policy
- Renko 80 -> 240 -> 480 readiness onarımı
- gerçek emir / stop / profit-floor / exit matematiği
- R8 bulk KLINE semantiği
- Telegram bağımsız 30 sn scheduler
- Williams %R shadow-only
