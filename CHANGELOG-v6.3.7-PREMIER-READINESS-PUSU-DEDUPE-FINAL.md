# AGROS ST2 v6.3.7 — PREMIER READINESS & PUSU DEDUPE FINAL

Yayın tarihi: 28.07.2026

## Düzeltilen kritik sorunlar

### 1. 29/29 hazır olmasına rağmen Premier kapısının kapalı kalması
- Exact DNA giriş kapısındaki sabit `30 coin` şartı kaldırıldı.
- Global Historical ile Exact DNA artık aynı merkezi 29 coin havuzunu kullanıyor.
- `HISTORICAL_30_COIN_TRAINING_INCOMPLETE` kaldırıldı.
- Yeni fail-closed nedeni: `HISTORICAL_CANONICAL_POOL_INCOMPLETE`.
- 29/29 hazır + pozitif exact tarihsel DNA artık `HISTORICAL_EXACT_DNA_PREMIER` ile Premier açabilir.
- 28/29 ve altı durumlarda sistem güvenli biçimde Shadow kalır.

### 2. Aynı Renko pusunun tekrar tekrar yeni pusu sayılması
- Eski pusu imzasından ATR/fiyatla yeniden hesaplanan Renko kapanış fiyatları çıkarıldı.
- Yeni mantıksal kimlik: yön + pattern kimliği + pattern kodu + son kapanmış kaynak tuğla zamanı.
- Aynı kapanmış kaynak olayında ATR/Renko fiyatı küçük değişse bile yeni Telegram bildirimi oluşmaz.

### 3. Aktif pusunun her taramada yenilenmesi
- Aynı semboldeki aktif pusu tetiklenene veya Renko yaş sınırı dolana kadar korunur.
- Yeni tarama aktif pusunun oluşum zamanını ve bekleme süresini sıfırlamaz.
- Aktif pusu yeni adayla ezilmez ve tekrar Telegram'a gönderilmez.

### 4. Pusu bildirim hafızasının sınırsız büyümesi
- Bildirim kimliği hafızası süre ve adet bakımından sınırlandı.
- Varsayılan TTL: 168 saat.
- Varsayılan üst sınır: 5000 anahtar.
- Temizlenen kayıt sayısı audit loguna yazılır.

### 5. Exact DNA gözlemlenebilirliği
- Yeni pusu mesajında gerçek kısa DNA hash'i, Premier/Shadow modu ve karar nedeni gösterilir.
- Açılış pusu özetinde DNA hash'i ve mod görünür.
- Canlı portföyde en yaygın pusu karar nedenleri gösterilir.
- Aktif Shadow kanıtında ham anahtarın ilk karakterleri yerine gerçek DNA kısa hash'i kullanılır.

## Güvenlik ve veri devamlılığı
- ST1'e dokunulmadı.
- Gerçek emir yetkisi veya emir açma şartları değiştirilmedi.
- Entry/Exit state ve ledger dosyaları silinmez.
- Mevcut açık pozisyonlar geriye dönük Premier'e çevrilmez; restart sonrasında mevcut güvenli Restart-GAP davranışı korunur.
- Yeni girişler v6.3.7 kapısından değerlendirilir.

## Yeni modüller
- `80_st2_canonical_historical_pool.js`
- `81_st2_pusu_notification_dedupe.js`

## Test
- Yeni regresyon: `test_v637_premier_readiness_pusu_dedupe_final.js`
- `npm test` başarıyla geçti.
- Uyumluluk zinciri: v6.3.7, v6.3.6, v6.3.5, v6.3.4, v6.3.3, v6.3.2, v6.3.1, v6.3.0, v6.2.2–v6.1.3.
