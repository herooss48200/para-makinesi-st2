AGROS v3.6.1 - EXIT REPLAY ENGINE FOUNDATION
Yayın: 10.07.2026

AMAÇ
Kapanan her işlemi, mevcut işlem yolculuğundan doğrulanabilen farklı çıkış davranışlarıyla sanal olarak yeniden değerlendirmek.
Trade Engine, giriş stratejisi, stop yönetimi ve gerçek/sanal emir davranışı değiştirilmez.

EKLENEN ÜRÜN
- 22_exit_replay_engine.js
- Gerçek çıkış baseline
- Fixed TP replay ailesi: %0.4, %0.8, %1.2, %2, %3, %5
- MFE Capture benchmark ailesi: %50, %65, %80, %90
- Kaydedilmiş en iyi kâr koruma replay'i
- İşlem bazlı JSONL ve CSV çıktı
- Genel algoritma sıralaması
- DNA bazlı en iyi Exit davranışı modeli
- Telegram kapanış karşılaştırması
- Kalıcı hafızada exitReplayOzet

VERİ DÜRÜSTLÜĞÜ
Tam mum/tick fiyat yolu bu sürümde kaydedilmediğinden:
- Fixed TP yalnızca MFE hedefe ulaşıldığını kanıtlıyorsa alternatif çıkış üretir.
- Hedefe ulaşılmadıysa gerçek kapanış fallback olarak korunur.
- MFE Capture sonuçları açıkça ORACLE_BENCHMARK olarak işaretlenir ve canlı emir önerisi sayılmaz.

ÇIKTILAR
- data/exit-replay-results.jsonl
- data/exit-replay-results.csv
- data/exit-replay-model.json

SONRAKİ DOĞAL ADIM
v3.6.2 Price Path Recorder: kapanış replay'lerinin tam kronolojik mum/tick yolu üzerinde gerçekçi trailing, time exit, ATR ve SuperTrend exit olarak oynatılması.
