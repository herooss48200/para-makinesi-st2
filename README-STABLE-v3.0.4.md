# Para Makinesi Binance - v3.0.4 STRATEGY-LAB-REPORT-CLEANUP

Bu sürüm işlem motoruna dokunmadan sadece analiz ve Telegram raporlama katmanını temizler.

## Düzeltmeler

- Genel canlı rapor 10 dakikada bir kalır.
- Genel canlı rapora toplam kapanan işlem ve LONG/SHORT kapanış dağılımı eklendi.
- LONG kapanışların genel tabloya ve analiz merkezi istatistiklerine görünür şekilde yansıması güçlendirildi.
- Strategy Lab radarı aynı kapanış sayısı ile tekrar gönderilmez; duplicate Telegram kirliliği azaltıldı.
- TOP 10 / WORST 10 tam imza formatı netleştirildi.
- İmza satırlarında Profit Factor, Net PNL, Ortalama Net ve Güven seviyesi gösterimi güçlendirildi.
- Pusu raporu sadece başlangıçta 1 kez kalır.
- İşlem açma/kapama, SL/TP/trailing ve sniper/pusu motoruna müdahale edilmedi.

## Deployment

```bash
git add .
git commit -m "v3.0.4 Strategy Lab Report Cleanup"
git push
```

AWS:

```bash
cd ~/para-makinesi-binance
git pull
pm2 restart para-makinesi
pm2 logs para-makinesi
```
