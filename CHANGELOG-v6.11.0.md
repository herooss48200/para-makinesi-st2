# CHANGELOG v6.11.0 — GOLDEN LIVE CHAIN

## Gerçek emir ve Binance zaman zinciri

- Binance server-time otoritesi, RTT telafili offset ve periyodik senkron eklendi.
- Bütün signed Futures çağrılarına açık `recvWindow` ekleniyor; `-1021/recvWindow` hatasında yalnız bir zorunlu senkron ve bir kontrollü tekrar yapılıyor.
- Zaman otoritesi sağlıklı değilse gerçek giriş fail-closed kalıyor.
- Restart mutabakatındaki hesap-geneli yetim emir temizliği tek sorgu dalına indirildi; geçmişteki her kapanmış sembol için tekrar Algo sorgulama kaldırıldı.

## Başlangıç ve ağ yükü

- 200 coin mum/SuperTrend hazırlığı arka plana alındı; gerçek pozisyon mutabakatı ve koruma döngüsü öncelikli çalışıyor.
- Yeni giriş, mum ve SuperTrend evreninin en az %95'i hazır olana kadar kapalı.
- Başlangıç ısınması bitmeden periyodik tazeleme başlatılmıyor; aynı evren için paralel çift ağ dalgası engellendi.
- Global Historical görev başlangıçtan 10 dakika sonraya alındı; piyasa hazır değilse veya gerçek pozisyon varsa erteleniyor.
- Restart sırasında bulunan kapanışın Telegram bildirimi arka plana alındı; Telegram kesintisi startup mutabakatını bloke etmiyor.

## Telegram dayanıklılığı

- Native IPv4 ve curl IPv4 hatları için ayrı circuit breaker eklendi.
- `CURL_EMPTY_RESPONSE` belirsiz teslim kabul ediliyor: tekrar veya düz-metin ikinci gönderim yapılmıyor.
- HTML düz-metin fallback yalnız Telegram entity/parse reddinde kullanılabiliyor.
- Kritik/panel/detay kuyrukları sınırlandı; panel ve detay istekleri birleştiriliyor.
- Tekrarlanan ulaşım hata logları bastırılıyor ve hat düzelince toparlanma kaydı üretiliyor.
- Startup mesajlarının erken/zengin çift gönderim yarışı kapatıldı.

## Stop ve kâr koruması

- Her pozisyon kendi Entry tuğlası, Renko box değeri ve dondurulmuş Exit takip mesafesiyle açılıyor.
- Komisyon sonrası güvenli kâr oluşunca Renko takip devralıyor.
- Ham MFE her fiyat güncellemesinde izleniyor; Binance stopu yalnız tamamlanmış Renko adımında ilerliyor.
- Aynı stop, minimum yenileme aralığı ve cooldown kontrolleri ağ çağrısından önce yapılıyor.
- İstenen stop borsada zaten aktifse benimseniyor; belirsiz yanıttan sonra çift stop üretilmiyor.
- Stop yenileme retry state'i her saniye diske yazılmıyor.
- Atomik yeni-stop doğrulama, eski-stop iptali, rollback ve acil fail-closed korumaları korunuyor.

## Korunan zincir

- Entry binding, Premier gate, gerçek/shadow ayrımı, manuel kapanış auto-rearm, kesin Binance muhasebesi ve net-kâr replay korunur.
- DNA Exit Replay gölge bilimsel katmandır; canlı pozisyonu `SAFE_COMMISSION_BRICK_TRAIL` yönetir.
