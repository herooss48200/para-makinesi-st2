AGROS Strategy Lab v3.2.1 - Full Signature DNA

Hedef:
- Full Signature DNA: BTC + Coin + BB + Yön + Pusu Tipi.
- Mevcut Trade Engine davranışına dokunmaz.
- Runtime data silmez/değiştirmez; yeni istatistik bucket'ı ekler: blackboxOzet.fullSignatureStats.
- Telegram rapor modeline Full Signature DNA Lab bölümü ekler.

Kontrol:
node --check .\8_blackbox.js

Commit önerisi:
git add 8_blackbox.js
git commit -m "v3.2.1 Full Signature DNA Lab"
git push
