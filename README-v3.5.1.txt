# Para Makinesi Binance v3.5.1 BTC Min Quantity Repair

Tarih: 09.07.2026

Bu sürüm canlı AWS loglarında BTCUSDT için tekrar eden miktar=0 spamını düzeltir.

## Problem

BTCUSDT fiyatı yüksek olduğu için 5 USDT marjin x 10 kaldıraç = 50 USDT notional, Binance BTC minQty 0.001 şartını karşılamıyordu.
62800 USDT civarında 0.001 BTC yaklaşık 62.8 USDT notional gerektirir. Eski miktar klipleme 0.000796 BTC değerini stepSize 0.001 ile aşağı yuvarlayıp 0 yapıyordu.

## Çözüm

- Miktar yetersizse artık console.error ile sürekli hata basılmaz.
- Sembol/yon bazlı log 15 dakika soğutmaya alınır.
- İlgili pusu temizlenir; aynı pusu aynı döngüde tekrar tekrar emir denemez.
- Logda ayrılan notional, gerekli notional ve gerekli marjin açıkça gösterilir.
- Trade Engine giriş stratejisi değiştirilmedi.
- Risk otomatik büyütülmedi; AGROS kullanıcı izni olmadan BTC pozisyon boyutunu artırmaz.

## Beklenen sonuç

PM2 error log artık BTCUSDT miktar=0 satırlarıyla dolmaz. BTCUSDT, mevcut sermaye ayarı minimum emir şartını karşılamadığında kontrollü şekilde atlanır.
