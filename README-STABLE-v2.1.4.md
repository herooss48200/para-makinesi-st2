# Para Makinesi Binance - AWS Stable v2.1.4

## Hedef
Bu sürümün tek hedefi geç giriş problemini azaltmaktır.

## Ana düzeltme
v2.1.3'te sniper SuperTrend sadece kapanmış 5m mumlardan hesaplanıyordu. Fiyat kırılımı önce, SuperTrend onayı sonra gelirse bot 5m mum kapanışını bekleyebiliyordu.

v2.1.4'te `canliSniperTetikAktif: true` eklendi. Bot aktif pusularda canlı fiyatla geçici bir sniper mumu üretir ve SuperTrend kararını her ana döngüde tekrar hesaplar.

## Değişen dosyalar
- `ayarlar.js`
- `1_hafiza.js`
- `4_pozisyon.js`
- `revizyon.js`
- `versiyon.js`

## Güvenlik notu
Varsayılan emir modu hâlâ SANAL'dır. Kapanmış mum onayına dönmek istersen `ayarlar.js` içinde `canliSniperTetikAktif: false` yapabilirsin.

## v2.1.4-b - Giriş Teşhisi Logları

Pozisyon açılışına giriş teşhis verileri eklendi:
- Pusu TF / Sniper TF
- Hedef fiyat / tetik fiyatı / giriş fiyatı
- Giriş-tetik sapması (%)
- Kırılımdan emre geçen süre (ms)
- SuperTrend onayından emre geçen süre (ms)
- SuperTrend yönü ve kaynak bilgisi (CANLI/KAPANMIS)
- Tetik sırası ve pusu sayacı

Amaç: Grafik üzerinden tahmin yürütmeden, geç giriş veya erken giriş problemini sayısal veriyle tespit etmek.


## v2.1.4-c - Hedef = Tetik Düzeltmesi

TRBUSDT örneğinde görülen farkın sebebi `tetikYuzdesi: 0.25` ayarıydı.
Bot hedef kırılımından sonra değil, hedefin %0.25 üstünü bekliyordu.
Bu sürümde `tetikYuzdesi: 0` yapıldı.

Yeni davranış:
- LONG: `canliFiyat >= hedef` olduğunda kırılım kabul edilir.
- SHORT: `canliFiyat <= hedef` olduğunda kırılım kabul edilir.
- Telegram teşhisine `Tetik Modu: HEDEF= TETIK` satırı eklendi.

Amaç: “13.283 görüldükten sonra girmeliydik” mantığıyla uyumlu çalışmak.

## v2.1.5-sniper-debug - Sniper Mum Teşhisi

Bu paket test için hazırlanmıştır.

- Pusu TF: 15m
- Sniper TF: 1m
- Günlük emir limiti: 0 = limitsiz
- Maksimum aktif pozisyon: 100
- debugSniperMum: true
- Giriş teşhisine 1m sniper mum OHLC, canlı fiyat/tetik karşılaştırması ve High/Close - Low/Close tetik bilgileri eklendi.
