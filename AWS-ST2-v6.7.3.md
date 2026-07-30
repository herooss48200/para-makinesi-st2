# AGROS ST2 v6.7.3 — AWS Dağıtım

## Amaç
LAB canlı öğrenmesinin final lig kararına bağlanması:
- Son 5 bilimsel LAB kapanışı Net > 0, PF > 1 ve Expectancy > 0 ise sonraki uygun işlem Premier.
- Aynı son-5 pencere pozitif ekonomi kapısını kaybederse sonraki uygun işlem Shadow.
- Exact-context `LIVE_N3_DEMOTED_TO_SHADOW` güvenlik vetosu korunur.
- Açık pozisyonların ligi değişmez; yalnız yeni pozisyonlar etkilenir.
- Geçmiş Shadow sonuçları geriye dönük Premier kasasına yazılmaz.

## Değişmeyenler
- Renko pusu ve giriş sinyali
- Trade Engine emir matematiği
- Stop, BE, ATR/MFE ve exit davranışı
- Gerçek emir yetkisi (kapalı)
- State/Ledger geçmişi

## Yerel doğrulama
```bash
npm ci
npm run check
```

Beklenen son satırlar:
```text
✅ v6.7.3 full source syntax passed
✅ v6.7.2 single-delivery Telegram + safe adaptive exit + report truth passed
✅ v6.7.3 live LAB promotion + demotion + isolated accounting passed
```

## Git
```bash
git add .
git commit -m "fix(st2): v6.7.3 live LAB promotion and demotion"
git push origin main
```

## AWS
```bash
cd ~/apps/para-makinesi-st2
git pull origin main
npm ci
npm run check
pm2 restart agros-st2 --update-env
pm2 save
pm2 logs agros-st2 --lines 120
```

## Canlı doğrulama
Yeni pusu/pozisyon loglarında şu kanıtlar aranır:
```text
LAB_LIVE_N5_PROMOTED_PREMIER
LAB_LIVE_N5_DEMOTED_TO_SHADOW
```

Operasyon raporunda:
```text
Canlı yükselen X | Canlı düşen Y
```
