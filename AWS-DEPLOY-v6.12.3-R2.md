# AWS dağıtımı — AGROS ST2 v6.12.3-R2

## Yerel
Paket içeriğini güncel ST2 klasörünün köküne kopyalayın.

```powershell
cd "C:\Users\ASUS\OneDrive\Desktop\ArgosPlatform\Repositories\ParaMakinesiBinance\ST2"
npm test
git status --short
```

Testler tamamen geçtikten sonra:

```powershell
git add 2_rapor.js 4_pozisyon.js 69_operation_intelligence_dashboard.js 72_st2_renko_entry.js 88_st2_williams_cycle_shadow_lab.js 89_st2_renko_entry_confirmation_shadow_lab.js ayarlar.js package.json package-lock.json versiyon.js test_v6105_active_exit_report_reconciliation.js test_v6110_golden_live_chain.js test_v6112_direct_profit_floor_two_slot.js test_v6122_golden_renko_williams_shadow.js test_v6123_renko_entry_confirmation_shadow.js README-FIRST-v6.12.3-R2.txt CHANGELOG-v6.12.3-R2.md AWS-DEPLOY-v6.12.3-R2.md TEST-RESULT-v6.12.3-R2.txt FILE-LIST-v6.12.3-R2.txt SHA256SUMS.txt
git commit -m "feat(st2): v6.12.3-R2 full lifecycle Renko entry confirmation shadow"
git push origin main
```

## AWS

```bash
cd /home/ubuntu/apps/para-makinesi-st2-gercek
git pull origin main
npm test
pm2 restart agros-st2-gercek --update-env
pm2 status
```

## İlk kontrol

```bash
grep -E "6.12.3-R2|RENKO ENTRY CONFIRMATION|FULL TETİK|FULL CLOSE|FULL NO_ENTRY|STARTUP ENTRY GATE|BOT AKTİF" \
  logs-st2/agros-st2-gercek-out.log | tail -n 120
```

Beklenen sürüm:

```text
6.12.3-R2-RENKO-ENTRY-CONFIRMATION-FULL-LIFECYCLE-SHADOW
```
