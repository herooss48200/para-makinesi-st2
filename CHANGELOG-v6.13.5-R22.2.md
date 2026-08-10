# AGROS ST2 v6.13.5-R22.2 — KASA RECOVERY DIRECT FILTER + 40USDT + POST-CLOSE 24H

## Değişiklikler

- Gerçek pozisyon hedefi **40 USDT toplam notional** olarak ayarlandı: `8 USDT marjin x 5x kaldıraç = 40 USDT`.
- R22.1 15m CONFIRMED mimarisi aynen korunur.
- Gerçek DIRECT emir yetkisi yalnız **0.50T** ve **1.00T** için açıktır.
- DIRECT 0.25T / 0.75T / 1.25T / 1.50T ve diğer izin dışı değerler Binance emri göndermez; ayrı `FILTERED DIRECT SHADOW` lifecycle’a yönlendirilir; bu lifecycle `aktifPozisyonlar/alinanlar` kullanmadığı için sembolü gerçek CONFIRMED adaylarına karşı bloke etmez.
- CONFIRMED, DIRECT-tuğla filtresinden muaftır. R22.1 kanıt kapılarını geçtiğinde gerçek CONFIRMED emir yetkisi korunur.
- ST2 entry mode eksik/geçersizse gerçek emir fail-closed olarak shadow'a düşer.
- Her gerçek kapanıştan sonra **24 saat post-close bilimsel fiyat-yolu** başlatılır.
  - Orijinal giriş fiyatına göre post-close best/worst yüzde,
  - +0.25 / +0.50 / +0.75 / +1.00 / +1.25 / +1.50 / +2.00 / +2.50 / +3.00 ilk hit,
  - -0.50 / -0.75 / -1.00 / -1.25 / -1.50 / -2.00 / -2.50 / -3.00 ilk hit,
  - 15m / 30m / 1h / 2h / 4h / 8h / 12h / 24h checkpoint kaydı tutulur.
- Post-close takip **yeni ağ isteği üretmez** ve **emir/stop/TP üzerinde hiçbir yetkisi yoktur**; mevcut `state.canliFiyatlar` cache'ini kullanır.
- Takip restart sonrasında `data/st2-post-close-24h-price-path.json` üzerinden devam eder; tamamlananlar `data/st2-post-close-24h-price-path.jsonl` ledger'ına yazılır.

## Bilimsel gerekçe

Mevcut gerçek kapanış örnekleminde 0.50T + 1.00T grubu pozitif kasa sonucu üretirken 0.25T ve 0.75T grupları negatif toplam ekonomi üretmiştir. R22.2 bu bulguyu canlıda kontrollü gerçek-emir filtresi olarak dener; CONFIRMED öğrenme/otoritesi kapatılmaz. Bu küçük örneklem kesin uzun dönem edge garantisi değildir; filtre canlı veriyle yeniden doğrulanmalıdır.
