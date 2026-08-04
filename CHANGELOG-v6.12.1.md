# AGROS ST2 v6.12.1 — CORE-FIRST STARTUP WARMUP

## Neden
v6.12.0 canlı başlangıçta PM2 süreci online kalmasına rağmen piyasa hazırlığı uzun süre `Mum 0 | ST 0` görünüyordu. Sorun ST1-gated Renko giriş mantığında değil, v6.11.2'den kalan başlangıç ısınma akışındaydı.

Eski akış giriş kapısını açmadan önce sırasıyla bütün evren için:
1. 15m Renko kaynak mumlarını,
2. 1m sniper/gölge mumlarını,
3. 3m ST1 SuperTrend mumlarını
bekliyordu. Yaklaşık 200 sembolde bu 600 ağ isteğine ulaşıyor ve sayaçlar ancak bütün faz bitince güncelleniyordu.

## Değişiklikler
- Başlangıç çekirdeği yalnız canlı giriş için gerekli iki veri kaynağına indirildi:
  - 15m Renko kaynak mumları
  - 3m ST1 SuperTrend
- 15m ve 3m verileri sembol başına paralel hazırlanır.
- Mevcut %95 hazır eşiği sağlandığı anda Entry Gate açılır; yavaş kalan son semboller kapıyı gereksiz yere bekletmez.
- 1m sniper/1m Renko kanıt verisi giriş yetkisi olmaktan çıkarılmadı; zaten gölge olan bu veri çekirdek hazır olduktan sonra LOW öncelikte doldurulur.
- Başlangıç ilerlemesi her 25 sembolde ve canlı heartbeat/Telegram raporunda görünür:
  - işlenen sembol
  - 15m mum hazır
  - 3m ST hazır
  - hata
- Başlangıç ağ eşzamanlılığı 8, işçi sayısı 16 olarak ayarlandı. Canlı normal kuyruk 3 bağlantıda kalır.
- Ana operasyon raporundaki yanıltıcı `Entry Evolution ... Uygulama` satırı kaldırıldı; yerine canlı giriş yetkisi açıkça gösterildi.

## Değişmeyenler
- ST2 Renko pattern ve BB teması
- ST1 15m pusu + 3m SuperTrend kapısı
- Referans Renko tuğlasının taze canlı kırılımı
- Eski kırılım latch engeli
- Premier/Shadow kararı
- Gerçek emir risk ayarları ve iki slot
- Stop, doğrudan kâr tabanı, Renko takeover, donmuş trail ve Exit Evolution
- State/Ledger ve restart GAP muhasebesi
