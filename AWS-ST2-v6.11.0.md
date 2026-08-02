# AGROS ST2 v6.11.0 — GOLDEN LIVE CHAIN / AWS

## Değişmez dağıtım şartları

- Güncelleme yalnız Binance gerçek pozisyonu `0` ve açık emir/Algo emri `0` iken yapılır.
- AWS `.env`, `data/`, state, ledger ve log dosyaları silinmez veya paket içeriğiyle ezilmez.
- Önce yerel `npm test`, sonra GitHub commit/push, ardından AWS pull yapılır.
- Tek PM2 restart uygulanır; sunucu reboot edilmez.

## İlk açılışta zorunlu kanıtlar

- Sürüm: `6.11.0-GOLDEN-LIVE-CHAIN`
- Binance time authority: `HEALTHY`
- Restart gerçek kapanış mutabakatı tamamlanmış ve gerçek slot boş.
- Startup Entry Gate önce kapalı, piyasa hazırlığı %95'e ulaşınca açık.
- Telegram Native/Curl circuit ve kuyruk durumu operasyon raporunda görünür.
- Yeni pozisyonda Entry binding ve pozisyona özel `SAFE_COMMISSION_BRICK_TRAIL` ataması görünür.
- Stop yalnız tamamlanmış Renko adımında güncellenir; mikro fiyat hareketinde Binance stop yenilemesi yapılmaz.

## Fail-closed durumları

Time authority sağlıksızlığı, borsa pozisyon mutabakatı, koruma emri doğrulaması veya kapanış muhasebesi çözülemezse yeni gerçek giriş açılmaz.
