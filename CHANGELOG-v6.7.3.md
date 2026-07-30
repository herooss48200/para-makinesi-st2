# AGROS ST2 v6.7.3 — LIVE LAB PROMOTION & DEMOTION FINAL

- LAB canlı son-N kapanış ekonomisi final giriş ligine bağlandı.
- Varsayılan pencere N5: Net > 0, PF > 1 ve Expectancy > 0 ise sonraki uygun işlem Premier.
- Aynı tamamlanmış N5 pencere pozitif ekonomi kapısını kaybederse sonraki işlem Shadow.
- Exact-context `LIVE_N3_DEMOTED_TO_SHADOW` veto önceliği korundu.
- Canlı LAB terfisi tarihsel negatif exact kaydı aşabilir; canlı düşüş hem tarihsel hem canlı Premier yetkisini durdurur.
- Terfi/düşüş yalnız yeni pozisyonlara uygulanır; açık pozisyonlar ve geçmiş kasa kayıtları değiştirilmez.
- `LAB_LIVE_PROMOTED_PREMIER` ve `HISTORICAL_CONTEXT_SHADOW` ayrı muhasebe bucket'ları kullanır; eski Shadow sonuçları geriye dönük Premier kasasına taşınmaz.
- Operasyon raporuna `Canlı yükselen` ve `Canlı düşen` sayaçları eklendi.
- Trade Engine sinyal, Renko pusu, stop, BE, ATR/MFE ve gerçek emir yetkisi değiştirilmedi.
