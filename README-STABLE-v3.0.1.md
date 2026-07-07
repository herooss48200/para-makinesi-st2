# PARA MAKİNESİ BINANCE — v3.0.1 AGROS STRATEGY LAB LIVE SIGNATURE

## Amaç
Bu sürüm strateji veya işlem motoru geliştirmez. v3.0.0 256 BTC×Coin matrisinin üzerine Telegram’da canlı karar bağlamı ekler.

## Eklenenler

### 1. Açılışta imza geçmişi
Her yeni pozisyon açılış kartında artık şu bilgiler görünür:

```text
📚 BU İMZANIN GEÇMİŞİ
🧬 İmza: L_B0111_C1001
🎯 Bu imzanın geçmiş başarı oranı: %...
📌 Örnek: ... işlem | TP:... SL:... BE:...
💰 Net: ... USDT | Ort.Net: ...
🏁 Sıralama: En iyi #... | En kötü #...
🧠 Karar: ...
```

İmza daha önce kapanmadıysa Telegram bunu açıkça yazar:

```text
Bu 256 BTC×Coin imzası için henüz kapanan geçmiş işlem yok.
```

### 2. Kapanışta güncellenmiş imza performansı
İşlem kapandıktan sonra aynı 256 imzanın istatistiği güncellenmiş haliyle kapanış analizinde görünür. Böylece TP/SL sonrası oran anında takip edilir.

### 3. Okunabilir imza açılımı
Kısa makine imzası korunur:

```text
L_B0111_C1001
```

Ayrıca emojili açıklama da gösterilir:

```text
BTC 5m⚫ 15m🟢 1h🟢 4h🟢
Coin 5m🟢 15m⚫ 1h⚫ 4h🟢
```

## Güvenlik
Bu sürüm otomatik ters işlem açmaz. Sadece istatistiksel karar bağlamı ve test adayı bilgisi üretir.

## AWS

```bash
npm install
npm run check
pm2 restart para-makinesi
pm2 logs para-makinesi
```
