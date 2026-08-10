# AGROS ST2 v6.13.5-R22.1 — CONFIRMED SHADOW LIVE LEARNING & OBSERVABILITY FINAL

## Neden
R22 bootstrap sonrası 8 mevcut patternin 8'i de DIRECT seçti. Bu güvenliydi; ancak yalnız seçilen gerçek modun kapanışı `live` evidence'e yazıldığı için, DIRECT dönemlerinde CONFIRMED'ın canlı piyasa rejiminde karşı-olgusal olarak gelişmesi yavaştı. Ayrıca Renko audit gerçek pusu değerlendirmelerini sayarken 30 sn Telegram paneline bu sayaçlar kopyalanmadığı için panel `Değerlendirilen 0` gösterebiliyordu.

## Değişiklikler
- R22 15m gerçek timing otoritesi aynen korunur: pusu sonrası kapanmış 15m Renko dönüşü + 15m offset + 1m Renko ST son sniper.
- Gerçek mod DIRECT iken her pusu için 0.25T / 0.50T / 0.75T 15m CONFIRMED adayları counterfactual canlı shadow olarak izlenir.
- Shadow tetik gerçek CONFIRMED sözleşmesini kullanır: post-signal CLOSED 15m R→G/G→R, hedef offset ve canlı 1m Renko ST aynı yön.
- Shadow hiçbir Binance emri göndermez. Açıldıktan sonra bootstrap ile aynı standardize ekonomi modeliyle izlenir: %1.50 stop, %0.40 TP, %0.40 BE tetik, +%0.12 tampon, %0.08 round-trip fee, 32 kapanmış 15m bar azami yaşam.
- Shadow sonuçları `data/st2-15m-confirmed-evidence.json` içinde ayrı `liveShadow` bölümünde kalıcıdır; restart sonrası açık deneyler devam eder.
- Mode policy CONFIRMED için bootstrap + gerçek live + counterfactual shadow live evidence'i birlikte okuyabilir. Shadow etkili ağırlığı varsayılan N60 ile sınırlandırılır.
- Gerçek mod zaten CONFIRMED ise aynı aday için duplicate counterfactual shadow açılmaz; gerçek kapanış `live` evidence'e yazılır.
- R22 bootstrap N30 cap, WR/PF/Expectancy/Net sağlık şartları ve DIRECT karşılaştırma guard'ı değişmedi.
- Renko audit funnel sayaçları `h.state.st2TaramaSagligi` RAM snapshot'ına taşındı. Telegram paneli artık gerçek `Değerlendirilen`, `Mode D/C`, fiyat/ST/birlikte/emir sayılarını gösterir.
- Panelde 15m CONFIRMED canlı shadow aktif/bekleyen/açık ve bu tur kapanan/no-entry sayaçları görünür.
- Eski 1m Renko confirmation laboratuvarı korunur fakat mesajları artık açıkça `LEGACY 1m SHADOW; gerçek Entry Mode seçim yetkisi YOK` der.
- Global Historical runtime R22'de olduğu gibi trade process içinde varsayılan OFF kalır.

## Değişmeyenler
- Gerçek emir yetkisi ve Binance order execution zinciri.
- Premier/Shadow kalite kapısı.
- Entry Evolution DIRECT hedef matematiği.
- R21 15m CONFIRMED timeframe authority.
- 1m Renko ST son sniper zorunluluğu.
- Stop / profit protection / exit yönetim matematiği.
