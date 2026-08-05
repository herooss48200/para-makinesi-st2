# AGROS ST2 v6.12.3-R2 — Renko Entry Confirmation Full-Lifecycle Shadow

## Kritik düzeltme
Önceki v6.12.3 taslağı yalnız `ENTRY_ONLY_SAME_CLOSE_WINDOW` çalışıyordu. Ana işlem kapanınca alternatif adaylar da aynı kapanış fiyatında sonlandırılıyordu. Bu nedenle “ana işlem erken stop olduktan sonra teyitli giriş daha sonra açılıp ne yapardı?” sorusu cevaplanamıyordu.

R2 ile kapsam `SAME_WINDOW_PLUS_FULL_LIFECYCLE` oldu.

## SAME_WINDOW
Ana pozisyon kapanışında her aday için:

- O ana kadar tetiklenip tetiklenmediği,
- Mark-to-market Net,
- MFE/MAE,
- `NO_ENTRY`, önlenen zarar ve kaçan kazanç

ayrı kaydedilir. Bu sonuç adayın bağımsız yaşamını kapatmaz.

## FULL_LIFECYCLE
Ana pozisyon kapandıktan sonra:

- Bekleyen `0.25T / 0.50T / 0.75T` adayları tetik penceresi boyunca izlenir.
- Tetiklenen aday bağımsız sentetik Shadow pozisyona dönüşür.
- `%1.50` başlangıç stopu kendi alternatif giriş fiyatından hesaplanır.
- Ana pozisyonda dondurulmuş `executionExitAssignment`, `exitPlanShadow` ve `renkoExitAssignment` adaya kopyalanır.
- Dynamic Exit, komisyon güvenli kâr tabanı ve frozen Renko trail bağımsız uygulanır.
- Sonuçlar parent işlemden ayrı ledger satırına yazılır.
- Açık deneyler state/backup üzerinden restart sonrası sürer.

## Zaman sınırları

- Alternatif tetik bekleme: varsayılan 60 dakika.
- Tetiklenmiş aday azami yaşam: varsayılan 360 dakika.
- Değerler `ayarlar.js` üzerinden değiştirilebilir.

## Telegram ve operasyon görünürlüğü

- Ana kapanış mesajında `SAME_WINDOW` sonuçları gösterilir.
- Mesaj, FULL yaşamda kaç adayın beklediğini/açık olduğunu bildirir.
- Bağımsız aday kapandığında veya `NO_ENTRY` olduğunda ayrı Shadow mesajı üretilir.
- Canlı raporda aynı-pencere aday N, tam-yaşam aday N, aktif deney/bekleyen/açık sayıları görünür.

## Değişmeyenler

- Golden Renko giriş otoritesi.
- Entry Evolution `0.25T–1.50T` canlı seçimi.
- Premier gerçek / Shadow sanal ayrımı.
- Gerçek emir fail-closed zinciri ve iki slot.
- Canlı stop ve Exit Evolution karar matematiği.
