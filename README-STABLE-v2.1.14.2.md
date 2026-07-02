# Para Makinesi Binance - Argos v2.1.14.2

## Amaç

Bu sürüm v2.1.14.1 üzerine kritik Telegram düzeltmesi içerir. Strateji değiştirilmemiştir.

## Zaman Dilimleri

- SuperTrend filtre: 1h
- Pusu: 1h
- Sniper: 3m

## Kritik Düzeltme

SHORT sanal pozisyon açılış mesajlarının Telegram'a gitmemesine neden olan HTML parse hatası düzeltildi.

Sorun: Giriş teşhisinde SHORT için `canliFiyat <= tetik` metni gönderiliyordu. Telegram `parse_mode: HTML` kullandığı için `<` karakterini etiket başlangıcı gibi yorumlayıp mesajı reddedebiliyordu.

Çözüm: Telegram mesaj metninde `<=` yerine güvenli `≤` karakteri kullanıldı.

## Analiz Merkezi

- LONG/SHORT kalite özeti
- A/B/C/D dağılımı
- TP/SL/BE sonuçları
- Son 10 işlem
- JSONL/CSV analiz kayıtları
- MFE/MAE yolculuk takibi

## Çalıştırma

```bash
npm install
node bot.js
```

PM2 kullanıyorsan:

```bash
pm2 restart ecosystem.config.js
```
