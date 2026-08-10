# AGROS ST2 v6.13.5-R19 — LIVE CPU ISOLATION FINAL

## Canlıda kanıtlanan kök sorun
R18, EXCHANGE_RECONCILIATION beklemesini ana Renko/pusu döngüsünden ayırdı; ancak canlı AWS kanıtında ilk Renko taraması yine 70s -> 148s -> 241s uzadı ve PM2 CPU %100 oldu. 25/200 ilerleme 148s sürdü. Bazı semboller 70-80s duvar süresi gösterdi; COOKIEUSDT Pattern/DNA aşaması 13s gördü.

Kaynak incelemesi iki aynı-event-loop CPU kaynağını gösterdi:
1. 30sn ST2 canlı paneli "minimal" görünmesine rağmen Entry Evolution, Exit/Takeover replay, Williams shadow, Entry Confirmation, Operation Intelligence ve bilimsel ledger partition hesaplarını senkron çalıştırıyordu.
2. Adaptive DNA/Premier gate her pusu kararında bütün tarihsel DNA kohort skorlarını yeniden hesaplayabiliyordu.

## R19 düzeltmeleri
- ST2 30sn operasyon paneli RAM-only oldu. Bilimsel ledger/DNA/replay toplulaştırmaları canlı panel üretiminden tamamen çıkarıldı.
- Premier score kohortu, tarihsel havuz + Entry Evolution + Takeover + kalibrasyon dosya imzasına göre cache edilir. Kanıt değişince otomatik invalidasyon olur; karar matematiği değişmez.
- Renko scan event-loop fairness 8 sembolden 2 sembole çekildi.
- setImmediate dönüş gecikmesi `ST2 EVENT LOOP STARVATION` ile görünür hale getirildi.
- Slow-symbol metriğine daha önce ölçülmeyen Expire ve BB aşamaları eklendi.
- Bot state `st2RenkoScanInProgress/StartedAt/FinishedAt` tutar; panel taramanın gerçekten çalıştığını RAM'den gösterir.
- Safe-startup State/Ledger sayısı RAM snapshot olarak tutulur; panel her 30sn ağır state özeti üretmez.

## Korunan değişmezler
- Golden Renko pattern + BB karar matematiği
- Entry Evolution offsetleri
- DIRECT / CONFIRMED Entry Mode Policy
- Premier/Shadow gerçek emir yetkisi
- 1m Renko ST readiness / repair mantığı
- gerçek emir boyutlandırma
- stop / profit floor / Renko trail / dynamic exit
- Williams %R shadow-only
- R18 nonblocking exchange reconciliation ve gerçek emir fail-closed control-plane
- Telegram hard deadline / circuit güvenliği
