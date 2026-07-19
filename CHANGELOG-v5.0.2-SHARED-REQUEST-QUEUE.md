# AGROS v5.0.2 — Shared Request Queue

## Kapatılan sorunlar

- Binance 3m/15m/1h/4h istekleri artık ayrı ayrı bağlantı fırtınası oluşturmaz.
- Tüm halka açık piyasa verisi tek global, sınırlı ve abort edilebilir HTTPS kuyruğundan geçer.
- Aynı sembol/periyot/limit isteği eşzamanlı gelirse tek bağlantıda birleştirilir.
- Kısa süreli mum cache'i SuperTrend, Sniper ve BlackBox tekrarlarını azaltır.
- Timeout olan HTTPS bağlantısı gerçekten kapatılır; arkada asılı istek bırakılmaz.
- Sembol başına hata logu yerine heartbeat satırında toplu ağ özeti gösterilir.
- Başlangıçta geçici ağ hatası yaşayan semboller takip listesinden kalıcı olarak çıkarılmaz.
- DNA registry yazma kilidi 20 saniyelik güvenli bekleme, sahiplik token'i ve ölü kilit temizliği ile güçlendirildi.
- Mevcut DNA kimlikleri için salt-okuma hızlı yolu eklendi; çalışan bot ve testler gereksiz kilit yarışına girmez.
- Runtime stability testi kendi geçici veri klasöründe çalışır.

## Değişmeyenler

Trade Engine, giriş şartları, League kararları, Exit atamaları, sanal muhasebe ve gerçek emir fail-closed davranışı değiştirilmedi.

## Veri güvenliği

Dağıtım ZIP'i `data/`, `.env`, `.git` ve `node_modules` içermez. Mevcut öğrenilmiş AWS verilerini üzerine yazamaz.
