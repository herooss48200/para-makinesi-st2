# AGROS ST2 v6.10.0 — REAL ORDER EXECUTION SAFETY

Tarih: 31.07.2026

## Amaç

Gerçek Binance USDⓈ-M Futures emir zincirini girişten kapanışa kadar fail-closed, tekrar-gönderimsiz ve restart güvenli hale getirmek.

Bu sürüm Trade Engine karar matematiğini, Renko giriş/çıkış evrimini, Premier/LAB seçimini, MFE Capture, ATR Takeover, BE veya bilimsel öğrenme algoritmalarını değiştirmez. Değişiklik gerçek emir yürütme, borsa mutabakatı, kalıcılık ve muhasebe katmanındadır.

## Düzeltilen kritik sorunlar

### 1. Aynı sinyalin tekrar emir açması
- Her giriş için deterministik fingerprint ve Binance `newClientOrderId` oluşturulur.
- PENDING/SUBMITTED/OPEN/CLOSING/QUARANTINED durumları diskte atomik olarak tutulur.
- Aynı sinyal daha önce işlendiğinde, eski kayıt kapanmış olsa bile aynı fingerprint yeniden emir açamaz.
- Aynı sembolde Binance pozisyonu, normal emir, Algo emri veya yerel aktif kayıt varsa yeni giriş reddedilir.

### 2. Timeout sonrası kör yeniden gönderim
- MARKET emri gönderildikten sonra timeout alınırsa ikinci emir gönderilmez.
- Aynı `clientOrderId` ile Binance emir kaydı ve gerçek pozisyon sorgulanır.
- Emir Binance tarafından kabul edilmişse mevcut fill sahiplenilir; bulunamazsa rezervasyon güvenli terminal duruma alınır.

### 3. Kısmi fill
- MARKET giriş emri PARTIALLY_FILLED/aktif kalırsa kalan miktar iptal edilir.
- Yalnız Binance pozisyonunda gerçekten gerçekleşen miktar sahiplenilir.
- Gerçek miktar, ortalama giriş fiyatı, minimum miktar/notional ve izin verilen notional sapması tekrar doğrulanır.

### 4. Pozisyon limiti yarışı
- Limit girişten önce hem Binance hem kalıcı state üzerinden kontrol edilir.
- Fill sonrasında bütün Binance pozisyonları yeniden sorgulanır.
- Eşzamanlı dış işlem nedeniyle limit aşılırsa pozisyon rollback edilir ve global blok kurulur.
- Pending/CLOSING/QUARANTINED kayıtlar yerel limite dahildir.

### 5. Binance Algo Service geçişi
- STOP_MARKET ve TAKE_PROFIT_MARKET emirleri eski `futuresOrder` yolundan çıkarıldı.
- SL/TP artık `futuresCreateAlgoOrder` ile USDⓈ-M Algo Service üzerinden oluşturulur.
- Algo emirleri `futuresGetAlgoOrder`, `futuresGetOpenAlgoOrders` ve `futuresCancelAlgoOrder` ile doğrulanır/yönetilir.
- Binance'ın resmî ham yanıt alanları `algoStatus`, `orderType`, `actualOrderId` ve `actualPrice` normalize edilir; eski wrapper alanlarına güvenilmez.
- `actualOrderId`, tetiklenen SL/TP fill'ini gerçek userTrades muhasebesine bağlar.
- `binance-api-node` tam olarak `0.13.10` sürümüne kilitlendi.

### 6. Stop yenileme koruma boşluğu
- Yeni BE/Renko/ATR stopu önce oluşturulur ve Binance'ta doğrulanır.
- Eski stop yalnız yeni stop doğrulandıktan sonra iptal edilir.
- Yeni stop kurulamazsa eski koruma aktif kalır; aday stop kalıcı olarak yeniden deneme kuyruğuna alınır.
- Eski stop iptal edilemezse yeni stop geri alınır; tek bilinen eski koruma korunur.
- Eski ve yeni stopun ikisi de iptal edilemiyorsa kayıt QUARANTINED olur ve yeni girişler global blokla durur.

### 7. Gerçek kapanış güvenliği
- Normal/dinamik/rollback kapanışlar deterministik client ID ile reduce-only MARKET emir kullanır.
- Timeout durumunda aynı kapanış emri sorgulanır; ikinci kapanış emri kör biçimde gönderilmez.
- Kısmi/aktif kapanış emrinin kalanı iptal edilir ve pozisyonun gerçekten sıfırlandığı tekrar doğrulanır.
- Pozisyon sıfırlanmazsa kayıt QUARANTINED olur ve bütün yeni girişler global blokla durur.

### 8. Restart mutabakatı
- Gerçek pozisyonlar artık ayrı, kalıcı yürütme state'ine yazılır.
- Restartta Binance açık pozisyonları ile kalıcı state karşılaştırılır.
- Kayıtlı pozisyonlar tüm çalışma zamanı alanlarıyla geri yüklenir.
- Binance'ta var olup state'te bulunmayan pozisyonlar “adopted/external” olarak sahiplenilir, bilimsel öğrenmeden çıkarılır ve koruma altına alınır.
- Açık pozisyon tarama evreni dışında kalmış olsa bile izlenen sembollere eklenir.
- Korumaları doğrulanamayan pozisyon QUARANTINED olur; bot temiz başlangıç yapmaz.
- Bot kapalıyken kapanmış kayıtlar sessizce silinmez; Algo durumu ve userTrades ile kapanış/muhasebe yeniden kurulur, audit/state'e yazılır ve Telegram'da restart mutabakatı olarak bildirilir.
- Pozisyonu olmayan sembollerde kalmış AGST2 normal/Algo orphan emirleri hesap genelinde taranır; temizlenemezse başlangıç fail-closed durur.

### 9. Harici emir çakışması
- Açık pozisyonda AGROS'a ait olmayan normal veya Algo emir bulunursa üzerine yeni koruma yığılmaz.
- Durum manuel mutabakat gerektiren güvenlik hatası olarak reddedilir.
- AGROS yalnız `AGST2` önekli kendi koruma emirlerini iptal eder; semboldeki bütün emirleri topluca silmez.

### 10. Gerçek PNL, komisyon ve kapanış nedeni
- Giriş/çıkış fill'leri `futuresUserTrades` üzerinden toplanır.
- Ortalama fill fiyatı, gerçekleşmiş PNL, USDT komisyonu ve net PNL gerçek Binance verisinden hesaplanır.
- USDT dışı komisyon asset'i USDT gibi sayılmaz; ayrı raporlanır ve muhasebe “kısmi” işaretlenir.
- Binance Algo SL/TP kapanışı yalnız resmî Algo tetik durumu ile sınıflandırılır; fiyatın stop/TP'ye yakın olması tek başına kanıt sayılmaz.
- Binance Algo SL/TP kapanışı manuel kapanış sayılmaz.
- Gerçek manuel/dış kapanışlarda yeniden giriş kilidi uygulanır ve bilimsel öğrenme güncellenmez.

### 11. Kalıcı state bozulması
- State atomik geçici dosya + rename ile yazılır; önceki sağlam sürüm `.bak` olarak korunur.
- Bozuk primary dosya sağlam backup'ın üzerine kopyalanmaz.
- Primary bozuksa backup'tan kurtarma yapılır.
- Primary ve backup birlikte bozuksa sistem boş state ile işlem açmaz; `STATE_CORRUPTION_NO_RECOVERY` ile fail-closed kalır.

### 12. İkinci gerçek bot süreci
- Aynı host ve Binance API hesabı için hesap bazlı PID kilidi oluşturulur.
- Farklı klasörden ikinci gerçek bot başlatılsa bile emir yürütme reddedilir.
- Çoklu host kullanımı desteklenmez; tek gerçek bot süreci zorunludur.

### 13. Canlı risk doğruluğu
- Eksik/NaN notional, kaldıraç, marjin tipi ve pozisyon limiti sessiz varsayılanlara düşmez.
- Kaldıraç 1–125 tam sayı, marjin tipi ISOLATED/CROSSED ve aktif limit sıfır veya pozitif tam sayı olmalıdır.
- `maxActivePositions = 0` yeni girişleri durdurur.
- Pozisyon büyüklüğü audit'i ve ret logları gerçek modda aynı canlı risk profilini kullanır.
- `AGROS_DATA_DIR` readiness ve execution state dosyalarında ortak şekilde desteklenir.

### 14. ARM güvenliği
- `AGROS_REAL_ORDER_ARM` yalnız başlangıçta değil, rezervasyon ve emir gönderiminden hemen önce doğrulanır.
- Eski `.env` içinde ARM açık kalsa bile `AGROS_REAL_ORDER_EXECUTION_ACK=V610_REVIEWED` verilmeden yeni giriş açılamaz.
- ARM kapalıyken yeni gerçek giriş gönderilmez.
- ARM kapalı olsa bile mevcut gerçek pozisyonların restart mutabakatı ve koruma yönetimi çalışabilir.

## Yeni kalıcı dosyalar

Bunlar runtime sırasında `AGROS_DATA_DIR` altında oluşur; dağıtım paketine dahil değildir:

- `st2-real-order-execution-state.json`
- `st2-real-order-execution-state.json.bak`
- `st2-real-order-execution-audit.jsonl`

Host hesap kilidi varsayılan olarak işletim sistemi geçici klasöründe API hesabına özel hash ile tutulur. Gerekirse `AGROS_REAL_ORDER_LOCK_FILE` ile özel yol verilebilir.

## Değişen kaynaklar

- `85_st2_real_order_execution.js` — yeni tek gerçek yürütme otoritesi
- `motor.js` — idempotent giriş, gerçek fill, Algo SL/TP, rollback ve canlı risk audit'i
- `3_piyasa.js` — restart mutabakatı ve pozisyon sahiplenme
- `4_pozisyon.js` — gerçek kapanış, gerçek muhasebe ve atomik stop yenileme
- `50_real_order_readiness_bridge.js` — katı risk + `AGROS_DATA_DIR`
- `bot.js` — gerçek/sanal başlangıç pozisyon etiketinin doğrulanması
- `package.json`, `package-lock.json`, `versiyon.js`
- `test_v610_real_order_execution_safety.js`
- güncellenen v6.9.3/v6.9.4 uyumluluk testleri

## Son güvenlik doğrulamasında eklenen düzeltmeler

### 15. Algo Service gerçek yanıt alanları
- Algo emir durumu Binance yanıtındaki `algoStatus` alanından okunur; eski/test uyumluluğu için `status` yalnız fallback'tir.
- Emir tipi `orderType` alanından okunur; `type` fallback olarak korunur.
- Tetiklenmiş Algo emrinin `actualOrderId` değeri gerçek kapanış fill muhasebesine bağlanır.

### 16. Atomik stop çift-emir karantinası
- Yeni stop aktif olduktan sonra eski stop iptal edilemezse yeni stop geri alınır ve yerel pozisyon eski stopta kalır.
- Yeni stop da geri alınamazsa iki close-all stop belirsizliği başarı sayılmaz; kayıt `QUARANTINED` olur ve `CIFT_STOP_KORUMA_MUTABAKATSIZLIGI` global bloku kurulur.
- İptal cevabı tek başına yeterli sayılmaz; tekil Algo sorgusu ve açık Algo listesiyle inaktiflik doğrulanır.

### 17. Hesap genelinde orphan emir temizliği
- Restartta sembol listesine bağlı kalmadan hesabın tüm açık normal ve Algo emirleri taranır.
- Pozisyonu olmayan sembolde kalan `AGST2` emirleri iptal edilip iptal durumu doğrulanır.
- Temizlenemeyen orphan emir varsa restart fail-closed kesilir.
- Açık pozisyon üzerinde kalmış AGROS normal giriş/kapanış emirleri de iptal edilmeden koruma mutabakatı tamamlanmaz.

### 18. Trigger precision ve hedge-mode koruması
- SL/TP tetik fiyatları sembolün `tickSize` ve `pricePrecision` kurallarına göre güvenli yönde kliplenir.
- Hedge mode satırlarında sıfır `BOTH` pozisyonunun seçilip gerçek LONG/SHORT pozisyonun yok sayılması engellendi.
- Hedge mode algılanırsa giriş, kapanış ve stop yenileme fail-closed reddedilir.

### 19. Kapanış muhasebesi ve sınıflandırma kesinliği
- Algo durum sorgusu ağ hatası verirse kapanış tahminen “manuel” sayılmaz; mutabakat yeniden denenir.
- Gerçek exit fill `futuresUserTrades` üzerinde gecikmeli gelebileceği için kontrollü retry uygulanır.
- Bilinen close/Algo `actualOrderId` varsa yalnız o emrin fill'leri muhasebeye alınır; bulunamazsa başka işlemler fallback olarak karıştırılmaz.
- Manuel kapanışta ters yöndeki en yeni realized-PNL fill'leri hedef pozisyon miktarına kadar seçilir.
- Exit fill doğrulanamazsa veya kapanış sonrası AGROS korumaları iptal edilemezse işlem kapandı kabul edilip yeni girişe devam edilmez; kalıcı karantina ve global blok uygulanır.

### 20. Sürüm özel dağıtım onayı
- Eski `.env` dosyasında ARM açık kalmış olsa bile v6.10.0 kendiliğinden yeni emir başlatmaz.
- Yeni giriş için ARM ve mainnet doğrulamasına ek olarak `AGROS_REAL_ORDER_EXECUTION_ACK=V610_REVIEWED` zorunludur.
- Bu ikinci onay yalnız AWS restart, açık pozisyon, orphan emir ve Algo koruma kontrolleri tamamlandıktan sonra verilmelidir.
