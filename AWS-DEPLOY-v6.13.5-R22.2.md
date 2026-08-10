# AWS Deploy — AGROS ST2 v6.13.5-R22.2

## Güvenlik

- `.env`, `data/`, state/ledger ve loglar korunur.
- npm upgrade / npm install yapılmaz.
- **Gerçek açık pozisyon varken PM2 restart yapılmaz.**
- Ubuntu `System restart required` uyarısı bu dağıtım için reboot nedeni değildir.

## Beklenen sürüm

`6.13.5-R22.2-KASA-RECOVERY-DIRECT-FILTER-40USDT-POSTCLOSE-24H-FINAL`

## Dağıtım sonrası kanıtlar

- Risk: `8.00 USDT marjin x 5 = 40.00 USDT notional`.
- İzin dışı DIRECT: `[DIRECT T GERÇEK EMİR FİLTRESİ] ... gerçek emir YOK ... SHADOW öğrenme devam`.
- İzinli DIRECT: 0.50T / 1.00T normal gerçek emir zincirine devam eder.
- CONFIRMED: DIRECT filtresinden muaftır; mevcut R22.1 policy kapıları geçerliyse gerçek emir zincirine devam eder.
- Gerçek kapanış: `[POST-CLOSE 24H TAKİP BAŞLADI]`.
- Checkpoint: `[POST-CLOSE 15M]`, `[POST-CLOSE 30M]`, `[POST-CLOSE 1H]` ...
- Tamamlama: `[POST-CLOSE 24H TAMAMLANDI]`.
