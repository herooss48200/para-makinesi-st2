AGROS v3.2.2 Intersection DNA Lab

Bu sürüm 8_blackbox.js üzerinde çalışır.

Eklenenler:
- Intersection DNA Lab
- Full Signature DNA içindeki BTC/Coin TF + BB + Pusu + Yön özelliklerini parçalar
- Kazanan ortak DNA kümelerini listeler
- Birleşince güçlenen DNA kümelerini gösterir
- Kaybeden ortak DNA kümelerini ters yön Watch Mode adayı olarak işaretler

Güvenlik:
- Trade engine'e dokunmaz.
- Otomatik ters işlem açmaz.
- Sadece Telegram raporu / analiz katmanı ekler.
- Runtime data ve sanal-state uyumluluğu korunur.

Test:
node --check .\8_blackbox.js

Commit önerisi:
git add 8_blackbox.js
git commit -m "v3.2.2 Intersection DNA Lab"
git push
