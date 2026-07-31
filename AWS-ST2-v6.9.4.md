# AWS — AGROS ST2 v6.9.4

Gerçek bot durmuşken ZIP içindeki dosyaları `~/apps/para-makinesi-st2-gercek/` klasörüne kopyalayın.

`.env` içinde:

```env
AGROS_REAL_ORDER_ARM=LIVE_TRADING_CONFIRMED
AGROS_REAL_ORDER_ENV=MAINNET
```

İşlem ayarları yalnız `ayarlar.js` içinden yönetilir:
- `gercekEmirSabitNotionalUsdt`
- `gercekEmirSabitKaldirac`
- `gercekEmirMarjinTipi`
- `gercekEmirMaxAktifPozisyon`

Kontrol:

```bash
npm test
```

Testler geçmeden gerçek bot başlatılmaz.
