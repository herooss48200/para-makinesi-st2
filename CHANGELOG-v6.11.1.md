# CHANGELOG v6.11.1 — PROFIT FLOOR & TWO SLOT

## Amaç

Uzun süre açık kalan tek gerçek pozisyonun bütün Premier fırsatlarını Shadow'a düşürmesini önlemek ve takeover sonrası neredeyse başa baş kapanışları azaltmak.

## Canlı risk

- Gerçek aktif pozisyon limiti `1 → 2` oldu.
- Marjin değişmedi: pozisyon başına `2 USDT`.
- Kaldıraç değişmedi: `5x`.
- Üçüncü gerçek pozisyon fail-closed olarak `2/2` limitinde reddedilir.
- Her pozisyonun giriş rezervasyonu, fill'i, STOP_MARKET ve TAKE_PROFIT_MARKET koruması bağımsız doğrulanır.

## Kâr koruma politikası

- Başlangıç stopu değişmedi: `-%1.50`.
- Canlı Renko aktivasyonu gerçekleşmeden başlangıç stopu korunur.
- Aktivasyonda önce brüt `+%0.40` kâr tabanı kilitlenir.
- Tahmini gidiş-dönüş komisyon `%0.10` sonrasında hedef minimum net `+%0.30` olur.
- Kâr tabanı kilitlendikten sonra pozisyona açılışta atanmış ve dondurulmuş Renko trail mesafesi devreye girer.
- Stop güncelleme adımı `1.00T → 0.50T` oldu.
- Stop hiçbir koşulda geriye gevşemez.

## Açık pozisyon geçiş güvenliği

- Takeover başlamamış v6.11.0 pozisyonları ilk güncellemede yeni güvenlik politikasına taşınır:
  - trail mesafesi korunur,
  - brüt taban `%0.40` olur,
  - minimum net `%0.30` olur,
  - güncelleme adımı `0.50T` olur.
- Takeover'ı zaten aktif eski pozisyonlar geriye dönük sıkılaştırılmaz; mevcut donmuş politika kapanışa kadar korunur.

## Rapor doğruluğu

- `Net taban` şeklindeki yanıltıcı ifade kaldırıldı.
- Operasyon ve takeover mesajları ayrı ayrı gösterir:
  - brüt kâr tabanı,
  - hedef minimum net,
  - canlı aktivasyon,
  - dondurulmuş trail mesafesi,
  - tamamlanmış-tuğla güncelleme adımı.
- ATR/MFE profillerinin yalnız gölge replay olduğu açıkça korunur.

## Değişmeyenler

- Entry Evolution matematiği değişmedi.
- Premier Score seçimi değişmedi.
- Başlangıç SL/TP emir zinciri değişmedi.
- Gerçek emir fail-closed korumaları değişmedi.
- Binance zaman otoritesi, atomik stop yenileme, Telegram circuit ve startup reconciliation korundu.
