AGROS v3.2.3 - Evolution / Common DNA Lab

Bu sürüm 8_blackbox.js dosyasına Evolution / Common DNA Lab katmanı ekler.

Eklenenler:
- TP DNA ve SL DNA ayırt edici fark analizi
- Kazanan DNA'yı ayıran genler
- Kaybeden DNA / ters yön zenginlik adayları
- Birleşince evrimleşen DNA kümeleri
- DNA Ayırt Gücü (100 üzerinden)

Güvenlik:
- Emir motoruna otomatik filtre veya ters işlem bağlanmadı.
- Tüm ters yön çıktıları Watch Mode adayıdır.
- Runtime data, sanal-state, CSV ve JSONL uyumluluğu korunur.

Test:
node --check .\8_blackbox.js

Commit önerisi:
git add 8_blackbox.js
git commit -m "v3.2.3 Evolution Common DNA Lab"
git push
