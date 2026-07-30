# AGROS ST2 v6.8.3 — Minimal Telegram Operations

## Amaç
Telegram'ı bilimsel rapor deposu olmaktan çıkarıp yalnızca canlı operasyon görünürlüğü için kullanmak.

## Değişiklikler
- Bütün Telegram gönderimleri için merkezi, tek mesajlık güvenli üst sınır eklendi: **3400 karakter**.
- Minimal modda HTML etiketleri kaldırılır ve mesaj hiçbir zaman çok parçalı gönderilmez.
- Canlı panel yalnız şu bilgileri gösterir:
  - State/Ledger sağlığı
  - aktif toplam/Premier/Shadow/GAP sayıları
  - Premier ve Shadow sonuç ekonomisi
  - aktif pusu sayısı
  - kısa Entry Evolution özeti
  - en fazla 5 aktif Premier
  - en fazla 3 gerçek lig terfi/düşüşü
- Ayrıntılı replay, DNA, BB/OHLC ve bilimsel tablolar Telegram'dan kaldırıldı; log/state/ledger içinde tutulmaya devam eder.
- İşlem kapanışında yalnız operasyon kapanış mesajı gönderilir. Ayrı bilimsel kapanış, BlackBox ve periyodik Exit Replay Telegram mesajları kapatıldı.
- Açılış pusu özeti en fazla 6 satırdır; kalan pusu sayısı tek satırda belirtilir.
- v6.8.2 dağıtımında görülen tanımsız `telegramOzetMetni` export hotfix'i korunmuştur.

## Değişmeyenler
- Trade Engine
- Renko giriş şartları
- Entry Evolution matematiği
- Stop/BE/ATR/MFE/takeover matematiği
- Pozisyon açma ve kapama davranışı
- State, ledger ve bilimsel kayıtlar
