# Para Makinesi Binance - AWS Stable v2.1.3

Bu sürüm v2.1.3 üzerinde görülen kontrolsüz tekrar emir açma sorununu düzeltmek için hazırlanmıştır.

## Ana Düzeltmeler

- Sanal pozisyonlar `data/sanal-state.json` dosyasına kalıcı olarak kaydedilir.
- Bot restart olunca eski sanal pozisyonları geri yükler.
- Aynı sembolde aktif pozisyon varken ikinci pozisyon açılması engellenir.
- Döngü başına yeni emir limiti eklendi: `maxYeniEmirDonguBasina`.
- Günlük yeni emir limiti eklendi: `gunlukMaxYeniEmir`.
- Telegram pusu raporu kısaltıldı; çok uzun sembol listesi artık özetlenir.
- `5_kalici_hafiza.js` modülü eklendi.

## Güvenlik Notu

`.env`, `node_modules/` ve `data/*.json` GitHub'a gönderilmemelidir.

## Test

```bash
npm install
npm run check
node bot.js
```

## AWS

```bash
git pull
npm install
npm run check
pm2 start ecosystem.config.js
pm2 logs para-makinesi-binance --lines 100
```

## Beklenen Loglar

Başlangıçta:

```text
💾 [KALICI HAFIZA] X sanal pozisyon geri yüklendi.
```

Tekrar emir engellendiğinde:

```text
🛡️ [PUSU TEMİZLENDİ] SYMBOL için zaten aktif pozisyon var. Yeni emir engellendi.
```

Döngü limiti çalıştığında:

```text
🧯 [DÖNGÜ EMİR LİMİTİ]
```


## v2.1.3 Düzeltmeleri
- Kapanış raporunda yüzde hesabı düzeltildi.
- `Kâr %` artık kaldıraçla şişirilmiş tek değer olarak gösterilmez.
- Fiyat hareketi %, brüt PNL, komisyon, net PNL, net pozisyon % ve marjin % ayrı gösterilir.
- İz süren stop ile kârda kapanış artık `Sanal SL` diye yanlış etiketlenmez.
- Başabaş stop / komisyon kapanışı ayrı gösterilir.
- Varsayılan risk limitleri sakinleştirildi: `maxPozisyonSayisi=10`, `maxYeniEmirDonguBasina=1`, `gunlukMaxYeniEmir=8`.
