# AGROS v4.2.0 — Real Order Readiness Bridge

## Amaç
Üç günlük Profit-First sanal doğrulamadan sonra gerçek emre geçiş için son güvenlik köprüsü.

## Değişiklikler
- Sanal ve gerçek emir aynı ortak Premier karar kapısından geçer.
- Premier şartları: N>=10, Exp>0, PF>1, Net>0.
- Premier kapasitesi yoktur; şartı sağlayan tüm DNA'lar lige girebilir.
- DNA imzası, lig modeli veya kârlılık kanıtı yoksa işlem açılmaz.
- Gerçek emir ayrıca çift kilit ister:
  - `gercekEmirYetkilendirmeAktif: true`
  - AWS ortamında `AGROS_REAL_ORDER_ARM`, `gercekEmirOnayKodu` ile aynı olmalı.
- Lig modeli yaş kontrolü eklenmiştir; eski/yok modelde gerçek emir fail-closed olur.
- DNA + piyasa rejimi + seçilen exit planı emir öncesi kimliğe eklenir.
- Kanıtlı dinamik exit yoksa mevcut kademe sistemi güvenli fallback olarak korunur.
- Telegram gerçek emir öncesi DNA, lig, N, Exp, PF, Net, rejim, exit ve engel nedenini gösterir.
- Kararlar `data/real-order-readiness-audit.jsonl` dosyasına yazılır.
- Tarihsel öğrenme ve Profit-First sıfır test kasası korunur.

## Güvenli başlangıç
Paket sanal modda ve gerçek emir yetkisi kapalı teslim edilir. Üç günlük test bitmeden gerçek emir gönderemez.
