AGROS ST2 v6.18.0-R30 — RENKO ONLY / 20 REAL SLOT
Base kaynak: Git commit 8617b481b4d240e3c9427d2e4d98cfcdf43df5dc

CANLI MIMARI
- Canli strateji modu: ST2_RENKO
- Toplam gercek pozisyon limiti: 20
- Renko gercek pozisyon limiti: 20
- Islem basina mevcut risk profili korunur: 4 USDT margin x 5 kaldirac = 20 USDT notional
- Renko Entry Evolution / Confirmed-Direct / 1m Renko ST / Premier-N5 / Binance execution korunmustur.
- Yuzdesel ekonomi korunmustur: SL -%2.50; +%1.50 -> SL +%1.00; sonra %0.50 geriden / 0.50 puan.

TELEGRAM
- Canli panel yalniz RENKO gosterir.
- Yeni Renko pusu Telegram mesaji kapali; pusu state/log ve panel sayaci devam eder.
- Gercek acilis/kapanis ve kritik operasyon mesaji altyapisi korunur.

PAKET POLITIKASI
Bu ZIP kaynak pakettir. Bilerek su klasor/dosyalar yoktur:
- .git
- data/
- node_modules/
- .env
- gecici .tmp klasorleri
Bu sayede AWS'deki canli state/ledger, ogrenme verisi ve secret'lar paketin acilmasiyla ezilmez.

ESKI ACIK POZISYON NOTU
Dagitim aninda eski stratejiden kalmis gercek pozisyon varsa genel Binance koruma/mutabakat yolu onu korumaya devam eder ve RENKO ogrenmesine yazmaz. Yeni alternatif-strateji girisi artik yoktur.
