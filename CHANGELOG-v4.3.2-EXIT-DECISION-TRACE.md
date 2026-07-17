# v4.3.2 — Exit Decision Trace

- DNA exit selector kararı pozisyon açılışında değişmez plan olarak dondurulur.
- Telegram açılış mesajı exit yöntemi, aktif/fallback durumu, N, Beat, PF, Net, seçim kapsamı, gerekçe ve plan kimliğini gösterir.
- Runtime executor dondurulmuş planı uygular.
- Selector planı ile dondurulmuş plan uyuşmazsa sessiz uygulama yerine güvenli fallback üretir.
- Readiness audit kaydı exit kanıtını ve uygulama durumunu kalıcı tutar.
