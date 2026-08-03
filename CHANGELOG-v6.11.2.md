# CHANGELOG v6.11.2 — DIRECT PROFIT FLOOR & TWO SLOT

## Amaç

Tek gerçek pozisyonun bütün Premier fırsatlarını Shadow'a düşürmesini önlemek, neredeyse başa baş kapanışları azaltmak ve canlı Renko aktivasyonunu eski `tpAdimYuzdesi × breakevenTetikKademe` bağımlılığından tamamen ayırmak.

## Ayarlardan yönetilen canlı değerler

```js
gercekEmirMaxAktifPozisyon: 2,
renkoCikisKarTabaniAktivasyonYuzde: 0.50,
renkoCikisCanliAktivasyonYuzde: 0.60,
renkoCikisGuvenliKarTabaniYuzde: 0.40,
renkoCikisMinimumNetKarYuzde: 0.30,
renkoCikisStopGuncellemeAdimTugla: 0.50,
```

Bu değerler birbirinden bağımsızdır. Canlı aktivasyon artık `0.40 × 2 = 0.80` şeklinde türetilmez.

## Kâr koruma zinciri

- K0: Başlangıç SL değişmedi, `-%1.50`.
- K1: Fiyat `+%0.50` gördüğünde brüt `+%0.40` stop tabanı kilitlenir.
- Yaklaşık gidiş-dönüş komisyon sonrası hedef minimum net `+%0.30` olur.
- K2: Fiyat doğrudan ayarlanmış `+%0.60` seviyesine geldiğinde pozisyona atanmış Renko tuğla takibi devreye girer.
- Stop güncellemesi her `0.50` tamamlanmış tuğlada hesaplanır.
- Stop hiçbir zaman geriye gevşemez.
- ATR/MFE profilleri yalnız gölge replay olarak kalır; canlı stopu yönetmez.

## Gerçek pozisyon limiti

- Değer `ayarlar.js` içindeki `gercekEmirMaxAktifPozisyon` alanından okunur.
- `0` yeni gerçek girişleri durdurur; mevcut pozisyonların yönetimi sürer.
- `1`, `2`, `3` ve üzeri değerler sabit kod kuralı olmadan kullanılabilir.
- Bu sürümün kontrollü doğrulama değeri `2`dir.
- Üçüncü pozisyon `2/2` limitinde fail-closed reddedilir.

## Açık pozisyon geçişi

- Takeover başlamamış açık pozisyonlar yeni doğrudan eşiklere taşınır.
- Pozisyona atanmış trail mesafesi korunur.
- Takeover'ı zaten aktif eski pozisyonlar geriye dönük sıkılaştırılmaz.

## Raporlama

Operasyon ve kapanış raporları artık ayrı gösterir:

- taban kilitleme eşiği,
- brüt kâr tabanı,
- minimum net hedef,
- doğrudan Renko aktivasyonu,
- dondurulmuş trail mesafesi,
- tamamlanmış tuğla güncelleme adımı.
