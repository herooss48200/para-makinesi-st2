# AGROS ST2 v6.10.3 — MANUAL CLOSE LOCK & SAFE TRAILING

## Gerçek emir güvenliği

- Binance üzerinde manuel/harici kapanış `MANUAL_EXTERNAL_CLOSE` olarak mutabakat edildiğinde kalıcı `MANUAL_EXTERNAL_CLOSE_REARM_REQUIRED` global kilidi açılır.
- Boşalan `1/1` gerçek pozisyon slotu aynı tarama turunda veya sonraki turda otomatik olarak başka bir işleme verilemez.
- Kilit yalnız hesapta açık gerçek pozisyon kalmadığı ve bot ARM/ACK kapalı olarak yeniden başlatıldığı zaman temizlenir; tekrar gerçek işlem için ayrıca yeniden ARM/ACK gerekir.
- Manuel kapanan aynı sembol/yön için ek süreli yerel yeniden giriş kilidi korunur; bu kilit Shadow öğrenmeyi durdurmaz.

## Güvenli trailing stop değişimi

- Öncelikli atomik yöntem korunur: borsa aynı anda ikinci stopa izin verirse yeni stop doğrulanır, sonra eski stop iptal edilir.
- Binance aynı yönde ikinci `closePosition` STOP_MARKET emrini reddederse kontrollü tek-stop fallback uygulanır:
  1. eski stop iptali doğrulanır,
  2. yeni stop oluşturulup aktifliği doğrulanır,
  3. yeni stop kurulamazsa eski stop eski seviyesinde yeni kimlikle geri yüklenir,
  4. geri yükleme de başarısızsa pozisyon reduce-only market ile acil kapatılır ve kalıcı global block açılır.
- Aynı başarısız stop adayı için 60 saniyelik cooldown ve log dedupe uygulanır; 8–10 saniyelik tekrar fırtınası engellenir.

## Gerçek işlem / Shadow öğrenme ayrımı

- `gercekEmirMaxAktifPozisyon: 1` yalnız Binance gerçek pozisyonlarını sınırlar.
- Canlı Shadow öğrenme Binance emri göndermeden, gerçek slotu ve günlük gerçek emir sayacını tüketmeden devam eder.
- Shadow gözlem üst sınırı `200`, sembol başına aynı anda en fazla bir aktif pozisyondur.
- Gerçek slot dolu, gerçek yetki kapalı, manuel rearm kilidi açık veya gerçek risk/preflight kapısı kapalı olduğunda uygun sinyal Shadow gözleme yönlendirilir.
- Shadow açılış mesajları varsayılan olarak Telegram’a gönderilmez; state/ledger ve bilimsel kapanış zinciri korunur.

## Telegram ve muhasebe uzlaştırması

- Gerçek Score-Premier aktif pozisyonu operasyon sayacında Premier olarak sayılır.
- Aktif satırı `Score-Premier` ve `Shadow Öğrenme` olarak açıkça ayrılır.
- Entry Replay N0 iken “öğrenilmiş atama” yazılmaz; güvenli/varsayılan giriş gösterilir.
- Exit fallback gerekçesi Entry kanıtı yokken yanlış biçimde “Giriş kanıtlı” demez.
- Takeover “profil atandı/eşik bekleniyor” ile “ATR kâr takibi gerçekten aktif” durumları ayrılır.
- Gerçek açılış mesajı fill miktarı/fiyatı, gerçek notional ve doğrulanmış STOP/TP Algo kimliklerini gösterir.
- Manuel/gerçek kapanış muhasebesi giriş komisyonu, çıkış komisyonu, toplam komisyon, brüt ve net PNL alanlarını ayrı kaydeder.
- Kapanan gerçek kayıtta `protectionStage: CLOSED` ve güncel `EXPIRED/CANCELED` protection snapshot tutulur.

Trade Engine giriş/çıkış matematiği, Entry Evolution, Exit Evolution, Takeover öğrenme profilleri ve mevcut state/ledger verileri değiştirilmez veya sıfırlanmaz.
