# Para Makinesi Binance v2.5.1 BLACKBOX-STATS-ENGINE-10CLOSE

Bu sürüm strateji/emir yönü revizyonu yapmaz. Orijinal emir açma mantığı korunur.

## Ana hedef
- TP/SL/BE sınıflandırması ve tekrar kapanış güvenliği korunur.
- BlackBox tam kombinasyon istatistikleri kalıcı hafızaya yazılır.
- Telegram'a her 10 kapanışta bir ayrı BlackBox İstatistik Raporu gönderilir.

## Telegram istatistik raporu
Ayarlar:
- blackboxIstatistikRaporuAktif: true
- blackboxIstatistikRaporAraligiKapanis: 10
- blackboxIstatistikMinIslem: 10

Rapor içerikleri:
- LONG/SHORT başarı ve net
- Trend aynı/ters yön istatistiği
- En karlı tam kombinasyonlar
- En zayıf tam kombinasyonlar
- BTC TF → işlem yönü etkisi
- Coin TF → işlem yönü etkisi
- BB + yön etkisi

## Kontrol
Tüm JS dosyaları `node --check` ile kontrol edildi.
