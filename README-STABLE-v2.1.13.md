# Para Makinesi Binance - AWS Stable v2.1.13

## Mimari

- Trend/SuperTrend filtresi: `4h`
- Pusu: `1h` Bollinger kapanmış mum
- Sniper: `3m` canlı tetik/teşhis
- Emir modu: varsayılan `SANAL`

## v2.1.13 değişiklikleri

1. Sniper periyodu `5m` yerine `3m` yapıldı.
2. 3 mum pusu iptal kuralı sadece `1h` pusu mumlarına göre korunur.
3. SHORT/LONG için geç giriş filtresi eklendi.
   - Varsayılan `maxGirisSapmaYuzde: 1.5`
   - SHORT örnek: hedef 90 ise 88.65 altı geç kalmış kabul edilir.
   - LONG örnek: hedef 90 ise 91.35 üstü geç kalmış kabul edilir.
4. Emir anı snapshot sistemi eklendi.
5. Telegram giriş teşhisinde RAW canlı fiyat, RAW tetik ve karşılaştırma sonucu gösterilir.
6. Emir açılmadan hemen önce son güvenlik kontrolü yapılır:
   - Ham fiyat hedefi gerçekten geçmemişse emir açılmaz.
   - Ham fiyat hedefin çok ötesine kaçmışsa emir açılmaz ve pusu iptal edilir.

## Çalıştırma

```bash
npm install
npm run check
npm start
```

PM2 ile:

```bash
pm2 start ecosystem.config.js
pm2 logs para-makinesi-binance
```

## Güvenlik

Varsayılan emir modu `sanalEmirModu: true` olarak bırakılmıştır.
Gerçek emir için `ayarlar.js` içinde ayrıca değiştirilmelidir.
