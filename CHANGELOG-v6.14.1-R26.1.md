# AGROS ST2 v6.14.1 — R26 CORE PHASED STARTUP

- Warmup öncesi yalnız tek bounded Binance positionRisk safety snapshot alınır.
- Full open-order/history/accounting restart reconciliation 15m/1m Renko warmup READY sonrasına ertelenir.
- Operasyon panel scheduler warmup sırasında çalışmaz; startup kritik mesajı korunur.
- Periyodik exchange reconciliation warmup READY ve startup reconciliation tamamlanana kadar çalışmaz.
- Gerçek entry safety artık market READY + startup unblock + taze reconciliation + network price şartlarının tamamını ister.
- Panel, market gate kapalıyken Gerçek Entry READY göstermez.
- Premier/N5, Direct/Confirmed, 20×20 USDT ve yüzde stop ekonomisi değiştirilmedi.
