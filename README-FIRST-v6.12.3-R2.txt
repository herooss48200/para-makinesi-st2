AGROS ST2 v6.12.3-R2 — RENKO ENTRY CONFIRMATION FULL-LIFECYCLE SHADOW
============================================================================

ÖNEMLİ DÜZELTME
- Önceki v6.12.3 paketi kullanılmayacak.
- Önceki paket adayları ana işlem kapanınca aynı anda sonuçlandırıyordu.
- R2 paketi ana işlem kapandıktan sonra adayları bağımsız yaşam döngüsünde izlemeye devam eder.

TABAN
- Yalnız AGROS ST2 v6.12.2 FINAL R2 / Git commit b1c11ac üzerine uygulanır.
- Golden Renko canlı giriş zinciri değiştirilmez.
- Entry Evolution canlı otoritesi, Premier/Shadow, gerçek emir ve iki slot korunur.

GİRİŞ TEYİT GÖLGESİ
LONG
1. Kapanmış kırmızı 1m Renko tuğlası.
2. Ardından kapanmış yeşil 1m Renko tuğlası.
3. Yeşil kapanıştan +0.25T / +0.50T / +0.75T alternatif giriş.

SHORT
1. Kapanmış yeşil 1m Renko tuğlası.
2. Ardından kapanmış kırmızı 1m Renko tuğlası.
3. Kırmızı kapanıştan -0.25T / -0.50T / -0.75T alternatif giriş.

İKİ AYRI SONUÇ
1. SAME_WINDOW
- Ana işlem kapandığı anda alternatif girişlerin o andaki MTM sonucu.
- NO_ENTRY, önlenebilecek zarar ve kaçabilecek kazanç ayrıca yazılır.

2. FULL_LIFECYCLE
- Ana işlem kapansa bile aday kapanmaz.
- Tetiklenmemiş aday 60 dakika boyunca kendi hedefini bekler.
- Tetiklenen aday kendi %1.50 ilk stopuyla açılır.
- Ana pozisyonda dondurulmuş Dynamic Exit ve Renko kâr koruma planı adaya kopyalanır.
- Aday kendi stopu, Dynamic Exit'i, Renko kâr tabanı/trail stopu veya 360 dakikalık güvenlik süresiyle kapanır.
- Restart sonrası açık deneyler state dosyasından devam eder.

WILLIAMS %R
- Kaynak 1m kapanmış ATR-Renko serisidir.
- LONG: -100..-90 dip bölgesinden nötre doğru yukarı dönüş.
- SHORT: -10..0 tepe bölgesinden nötre doğru aşağı dönüş.
- Uç bölgede yapışma tek başına destek değildir.

KALICI DOSYALAR AWS'DE OTOMATİK OLUŞUR
- data/st2-renko-entry-confirmation-shadow.json
- data/st2-renko-entry-confirmation-shadow.json.bak
- data/st2-renko-entry-confirmation-shadow-ledger.jsonl
- data/st2-williams-cycle-shadow.json
- data/st2-williams-cycle-shadow-ledger.jsonl

GÜVENLİK
- Yalnız SHADOW katmanıdır.
- Canlı/sanal emir açmaz, engellemez veya geciktirmez.
- Premier kararına ve Entry/Exit öğrenme otoritesine etkisi yoktur.
- İlk stop, gerçek emir, Binance koruma ve iki slot matematiği değiştirilmemiştir.
