# AGROS ST2 v6.13.5-R25.4 — STARTUP CORE LIVENESS

## Amaç
R25.3 Premier Selection Recovery aynen korunurken startup sırasında `CORE_15M_1M_RENKO` hazırlığının 200 hacim çekirdeği dışındaki restart-koruma sembolleri veya tekil asılı semboller yüzünden bloke olmasını engellemek.

## Değişiklikler
- **200-core readiness authority:** `sembolleriYukle()` hacim sıralamasındaki gerçek giriş evrenini `st2CoreUniverseSymbols` olarak dondurur. Restartta açık gerçek/Shadow/GAP pozisyonları fiyat koruması için `h.state.semboller` içine eklenmeye devam eder; ancak startup Entry Gate denominatorünü büyütmez.
- **Protection-extra isolation:** hacim core dışındaki korunan pozisyon sembolleri `st2ProtectionExtraSymbols` olarak ayrılır ve warmup sonunda canlı fiyat/pozisyon listesinden düşürülmez.
- **Per-symbol startup deadline:** 15m ve 1m startup istekleri ayrı ayrı süre sınırına sahiptir. Tek bir asılı istek bütün ilk turu ve 240/480 repair zincirini sonsuza kadar bekletemez.
- **240/480 repair liveness:** deadline/yetersiz 1m semboller 240 ve gerekirse 480 kapanmış 1m mum ile yeniden denenir. Her repair turu sonunda readiness tekrar hesaplanır; %95 core eşiği oluştuğu anda Entry Gate açılabilir.
- **Final error truth:** ilk 80 mum denemesinde oluşup daha sonra repair ile düzeltilen hata panelde kalıcı hata olarak taşınmaz. İlk-deneme hata sayısı ayrı `startupAttemptHata`, final eksik ayrı `startupFinalEksik` olarak tutulur.
- **Deadline ayarları:** `binanceStartupSymbolDeadlineMs=180000`, `binanceStartupRepairSymbolDeadlineMs=180000`.

## Korunan sözleşmeler
- R25.3 `COIN=1000/1001` Score-Premier OOS veto + N5 canlı recovery/demotion aynen korunur.
- N5 değişmedi.
- Premier at-open freeze değişmedi.
- 20 gerçek slot × 20 USDT değişmedi.
- R24.2/R25 stop authority değişmedi.
- Direct/Confirmed ve Golden ST2 Renko entry authority değişmedi.
- Exchange reconciliation gerçek girişte fail-closed kalır; R25.4 bu güvenlik kapısını gevşetmez.
