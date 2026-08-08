# AGROS ST2 — R12 GOLDEN LIVE RECOVERY FINAL

Bu paket yeni strateji veya yeni runtime deneyi değildir. 7 Ağustos canlı kayıtlarında 200 sembol Renko audit ve giriş hunisini tekrar tekrar tamamladığı kanıtlanan `6.13.5-R12-RENKO-1M-ST-READINESS-ENTRY-FUNNEL` runtime'ını geri kurar.

Korunan çekirdek:
- 200 coin Golden Renko
- Entry Evolution
- DIRECT / CONFIRMED Entry Mode Policy
- gerçek emir fail-closed güvenliği ve 10 slot
- Renko confirmation lifecycle
- Williams %R shadow
- profit floor / MFE / Renko exit
- restart/accounting koruması
- 1m gerçek Renko-ST readiness + 80→240→480 repair
- 30s live-panel scheduler

R13–R16 deneysel runtime değişiklikleri bu paket tarafından çağrılmaz.

Ek doğrulama:
- Eski R8 test sözleşmelerindeki iki rapor etiketi R12'nin güncel `1m Veri` / `1m Renko ST` terminolojisine uyarlanmıştır; runtime matematiği değiştirilmemiştir.
- Startup fixture gerçek Renko tuğlası üreten trending sentetik mumlarla düzeltilmiştir; runtime matematiği değiştirilmemiştir.
- `test_v6153_r12_main_loop_lifecycle.js`: 200 sembol READY sonrası 3 ardışık PRICE → PROTECTION → RENKO SCAN ve sıfır loop error kanıtı.
