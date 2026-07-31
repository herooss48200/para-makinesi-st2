# AGROS ST2 v6.9.4 — CONFIGURABLE LIVE RISK CONTROLS

## Düzeltildi
- Gerçek emir kapısındaki `25 USDT` ve `5x` sabit koşulları kaldırıldı.
- Pozisyon tutarı, kaldıraç, marjin tipi ve maksimum aktif gerçek pozisyon sayısı tamamen `ayarlar.js` üzerinden yönetilir.
- `.env` onayı risk değerlerinden ayrıldı: `AGROS_REAL_ORDER_ARM=LIVE_TRADING_CONFIRMED`.
- `gercekEmirMaxAktifPozisyon: 0` yeni gerçek girişleri durduran güvenli ayar olarak desteklendi.
- Geçersiz notional, kaldıraç veya marjin tipi yine fail-closed engellenir.

## Değişmedi
- Trade Engine giriş/çıkış matematiği
- Premier kalibrasyonu ve seçim mantığı
- Entry Evolution, Exit Evolution, Takeover ve MFE öğrenmesi
- Emir koruma, rollback, slippage/komisyon ve gerçek emir audit zinciri
