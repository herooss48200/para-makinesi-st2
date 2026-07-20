# AGROS v5.0.6 — Identity Chain Repair

## Kilitli kapsam

Bu sürümde yeni strateji, yeni analiz modülü veya yeni işlem kuralı eklenmedi. Trade Engine, League kriterleri, Exit seçme kuralları ve muhasebe hesapları değiştirilmedi.

## Kök neden

v5.0.5 giriş akışında BlackBox snapshot dış timeout'u 7 saniyeydi; ortak Binance kuyruğundaki iç mum istekleri ise 15 saniye ve retry'lı çalışıyordu. Yoğun arka plan taramasında giriş snapshot'ı kuyruğun arkasında kalabiliyor, dış timeout `null` döndürüyordu. Kod buna rağmen pozisyonu aktif state'e ekliyor; DNA/LAB/FULL kimliği, League ve Exit zenginleştirmesini sonradan yardımcı bloklarda deniyordu. Bu yarış koşulu aynı açılışta `DNA #YOK`, `LAB #YOK`, `FULL #YOK` ve `Snapshot alınamadı` üretebiliyordu.

## Yapılan onarım

- Giriş snapshot mum istekleri ortak kuyrukta `CRITICAL` öncelik aldı.
- Kuyrukta bekleyen aynı istek, giriş snapshot'ı istediğinde kritik önceliğe yükseltiliyor.
- BTC ve coin için 5m/15m/1h/4h verileri seri yerine kontrollü paralel çekiliyor.
- Snapshot timeout'u iç istek + retry süresinden kısa olmayacak şekilde düzeltildi.
- Eksik trend/Bollinger verisiyle sahte veya yarım kimlik üretilmesi engellendi.
- Tek koordinatör ile kalıcı sıra sabitlendi: `IDENTITY -> LEAGUE -> EXIT -> BLACKBOX -> TELEGRAM`.
- DNA, LAB veya FULL kimliği eksikse pozisyon aktif state'e alınmadan fail-closed duruyor.
- Hazırlanan kimlik/League/Exit kararı sanal ve gerçek pozisyona tek seferde kopyalanıyor; sonradan farklı kimlik üretme yolu kapatıldı.
- BlackBox kaydı ve Telegram gönderimi zincir aşaması olarak denetleniyor.

## Test

`test_v506_identity_chain_repair.js` aynı SKLUSDT/SHORT kimlik senaryosunu tekrarlar ve şunları doğrular:

- `DNA #171`, `LAB #378`, `FULL #365` birlikte ve tutarlı oluşur.
- Snapshot yoksa League ve Exit hiç çalışmaz; anonim pozisyon oluşmaz.
- Kimlik zinciri state kaydından önce tamamlanır.
- BlackBox Telegram'dan önce çalışır.
- Kritik snapshot isteği arka plan kuyruğunun önüne geçer ve bekleyen eş istek yükseltilir.
