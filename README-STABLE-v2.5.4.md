# PARA MAKİNESİ BINANCE - AWS Stable v2.5.4

## Kod Adı
AGROS-STRATEGY-LAB-SIGNATURE

## Amaç
Bu sürüm işlem motoruna dokunmadan AGROS Strategy Lab analiz katmanını güçlendirir. Artık BTC/Coin uyumu yalnızca `3/4` veya `1/4` olarak değil, uyumun hangi zaman dilimlerinden geldiğiyle birlikte kaydedilir.

Örnek:

```text
LONG | BTC[5m+15m+1h+4h] 4/4 | COIN[15m] 1/4 | BB ALT
Kısa imza: L_B1111_C0100_ALT
```

## Eklenenler

- Telegram BlackBox kartına renkli Strategy Lab imzası eklendi.
- LONG yönünde uyumlu UP zaman dilimleri yeşil, uyumsuzlar siyah görünür.
- SHORT yönünde uyumlu DOWN zaman dilimleri kırmızı, uyumsuzlar siyah görünür.
- `blackbox-snapshots.jsonl` kayıtlarına `strategySignature` objesi eklendi.
- `blackbox-trades.csv` dosyasına açılış/kapanış signature alanları eklendi.
- Tam kombinasyon istatistikleri artık periyot imzasına göre birikir.

## Yeni CSV Alanları

- `open_signatureKey`
- `open_signatureLabel`
- `open_btcAlignedTf`
- `open_coinAlignedTf`
- `open_btcBits`
- `open_coinBits`
- `close_signatureKey`
- `close_signatureLabel`
- `close_btcAlignedTf`
- `close_coinAlignedTf`
- `close_btcBits`
- `close_coinBits`

## Güvenlik

Bu sürüm emir açma, TP, SL, trailing stop, pusu veya sniper mantığını değiştirmez. Sadece analiz ve raporlama katmanında ölçüm yapar.

## Çalıştırma

```bash
npm install
npm run check
npm start
```

AWS üzerinde:

```bash
git pull
npm install
npm run check
pm2 restart para-makinesi
pm2 logs para-makinesi
```
