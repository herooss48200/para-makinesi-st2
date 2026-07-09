AGROS v3.4.0 - EXIT OPTIMIZER FOUNDATION

Amaç:
- Yeni giriş stratejisi eklemez.
- Trade Engine kararlarına dokunmaz.
- Açılmış işlemlerde çıkış kalitesini bilimsel olarak ölçer.

Eklenen dosya:
- 15_exit_optimizer_foundation.js

Entegrasyonlar:
- motor.js: Pozisyon açılırken Execution takip modeli başlatılır.
- 4_pozisyon.js: Her fiyat döngüsünde MFE/MAE güncellenir; stop ve kademe geçmişi tutulur; kapanışta Exit Optimizer kaydı üretilir.
- 5_kalici_hafiza.js: executionOzet sanal-state.json içinde korunur.
- 8_blackbox.js: BlackBox raporlarına Exit Optimizer bölümü eklenir.
- 14_intelligence_console.js: Intelligence Console health modeline Exit Optimizer eklenir.
- ayarlar.js: exitOptimizerAktif/export/Telegram ayarları eklendi.

Kaydedilen yeni metrikler:
- MFE: işlem boyunca görülen maksimum kâr yüzdesi.
- MAE: işlem boyunca görülen maksimum zarar yüzdesi.
- Kaçırılan kâr: MFE ile gerçek kapanış kârı arasındaki fark.
- Giveback: MFE'den kapanışa geri verilen yüzde.
- Profit Capture Ratio: kapanış kârı / MFE.
- Exit Efficiency: çıkış verim skoru.
- Stop geçmişi.
- Kademe geçmişi.
- DNA / Signature bilgisi.
- Confidence bilgisi.

Üretilen dosyalar çalışma sırasında data klasöründe oluşur:
- data/exit-optimizer-trades.jsonl
- data/exit-optimizer-trades.csv
- data/exit-optimizer-foundation.json

Önemli not:
Bu sürüm adaptif emir yönetimi değildir. Sadece ölçüm ve öğrenme temelidir.
v3.5.0 Adaptive Trade Manager için veri zemini hazırlar.
