# AGROS v4.3.5 – Live Elite Exit Rotation

## Amaç
Her DNA için Elite Exit seçimini piyasanın hızlı değişimine uyarlamak.

## Değişiklikler
- Dinamik Exit modeli artık her **5 kapanan işlemde** yeniden hesaplanır.
- Her Exit için son 5 ve önceki 5 pencere ayrı ölçülür.
- Son 5 sonuçta net negatif, PF 1 altı veya belirgin Beat bozulması yaşayan Exit `weakening` kabul edilir ve yeni pozisyonlara atanmaz.
- Son 5 sonuçta net pozitif, PF 1 üstü ve önceki pencereye göre iyileşen Exit `strengthening` kabul edilir ve sıralamada öncelik kazanır.
- Elite Exit seçimi son 5 net ortalama, Beat Rate, toplam skor ve toplam net ile canlı sıralanır.
- Minimum DNA ve Exit kanıtı 5 işlem olarak korunur.
- Doğrulanmış güçlü Exit yoksa mevcut kademe sistemi güvenli fallback olarak çalışır.
- Açılmış pozisyonun Exit ataması işlem boyunca dondurulur; yeni Elite yalnızca yeni açılan pozisyonlara atanır.
- Gerçek emir dinamik Exit kilidi varsayılan olarak kapalı kalır.

## Güvenlik İlkesi
Bir açık pozisyonda Exit yöntemini yarı yolda değiştirmek sonuçları ve risk hesabını bozabileceği için yapılmaz. Canlı rotasyon, model her 5 kapanışta güncellendikten sonra açılacak yeni pozisyonlarda uygulanır.
