# CHANGELOG v6.10.9

## Düzeltmeler
- Entry Evolution tuğlasının tetik, gate ve pozisyon kaydında ikinci kez seçilmesi kaldırıldı.
- Tetik tuğlası ile gate tuğlası uyuşmazsa emir açılması fail-closed durduruldu.
- Exit trail her pozisyona ayrı assignment ID ile atanıp kapanana kadar donduruldu.
- Restart sonrası eski pozisyon kendi trail mesafesini korur; profil değişikliği yalnız yeni pozisyonu etkiler.
- Komisyon-güvenli aktivasyon eşiği pozisyon açılışında donduruldu.
- Tuğla replay canlı modelle aynı güvenli taban ve çift yön komisyon hesabına bağlandı.
- Kâr koruması devreye girmeyen kapanışlar Exit öğrenmesini kirletmez.
- DNA Exit Replay canlı fallback olmaktan çıkarılıp açıkça gölge katman olarak raporlandı.
- Canlı Renko raporuna öğrenilmiş/kalıcı/varsayılan/atama-hata ayrımı eklendi.
- v6.10.7 manuel kapanış auto-rearm ve operasyonel dayanıklılık düzeltmeleri korundu.
