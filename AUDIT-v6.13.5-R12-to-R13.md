# R12 -> R13 Teknik Audit

Canlı kanıt:
- R12 startup: 40 sembol 240 mum, 2 sembol 480 mum derin onarım.
- Entry Gate: gerçek 1m Renko ST 200/200.
- READY sonrası birden fazla 30 sn panel raporu geldiği halde yeni ST2 RENKO AUDIT oluşmadı.
- Aynı dönemde NETWORK GUARD sürekli önceki SuperTrend refresh'in sürdüğünü bildirdi.

Kaynak zinciri:
1. `derinGecmisiInsaEt()` core startup'ı tamamlar.
2. R12, hemen `setImmediate(superTrendHesapla(... skipSniper:true ...))` ile 200 sembollük ST1 shadow warmup başlatır.
3. Bu görev aynı Binance ağ motorunu ve `superTrendCalisiyor` mutex'ini kullanır.
4. ST1 shadow giriş yetkisine sahip değildir.
5. Ana trading loop fiyat -> pozisyon koruma -> Golden Renko scan sırasındadır.

R13:
- R12'deki immediate ST1 shadow warmup kaldırıldı.
- Core 1m Renko-ST refresh ile ST1 shadow refresh ayrıldı.
- ST1 shadow ancak ilk `ST2 İLK TARAMA TAMAMLANDI` kanıtından sonra planlanır.
- Main-loop stage watchdog eklendi.
