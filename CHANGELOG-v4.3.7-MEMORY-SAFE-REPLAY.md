# AGROS v4.3.7 — Memory-Safe Replay

## Düzeltilen kritik sorun

`exit-replay-results.jsonl` daha önce tek seferde `readFileSync(..., 'utf8')`, `split()` ve `JSON.parse()` ile tamamen RAM'e alınıyordu. Kayıtlardaki ayrıntılı fiyat yolları nedeniyle başlangıç migration işlemi Node.js heap sınırını aşabiliyordu.

## Yeni davranış

- Replay JSONL dosyası 256 KB parçalar halinde okunur.
- Her işlem anında değerlendirilir; bütün replay geçmişi RAM'de tutulmaz.
- Fiyat yolu yalnız rejim sınıflandırması sırasında kullanılır ve ardından serbest bırakılır.
- Exit istatistikleri için sadece gerekli küçük alanlar saklanır.
- Son rejim tespiti için yalnız yapılandırılmış son pencere tutulur.
- Model yoksa pozisyon açılışındaki güvenli fallback de streaming builder kullanır.

## Korunan davranış

- v4.3.6 Relative Best Elite Exit seçimi aynen korunmuştur.
- Dinamik model her 5 kapanışta yenilenir.
- Açılmış pozisyonların exit planı dondurulur.
- Trade Engine ve sanal muhasebe kuralları değiştirilmemiştir.
