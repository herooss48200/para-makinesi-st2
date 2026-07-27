# AGROS ST2 v6.1.0 — GLOBAL HISTORICAL LEARNING & INTELLIGENCE RECONCILIATION

## Kapsam
- Merkezi 30 coin tarihsel havuzu ve varsayılan 15m eğitim sembolleri eklendi.
- Coin özel → benzer grup → global 30 → BTC/ETH prior kaynak zinciri eklendi.
- Kaynak adı, N ve güven seviyesi görünür hale getirildi.
- Gerçek açılış ekonomisi ile optimize replay ekonomisi tek kanonik bilimsel ledger üzerinden ayrıştırıldı.
- Entry Evolution etkisi: Net/PF/Expectancy farkı, önlenen zarar, kaçan kazanç ve tetiklenmeyen işlem olarak raporlandı.
- Duplicate closeId/tradeId kayıtları mutabakat okuyucusunda deterministik olarak dışlandı.
- LONG/SHORT ve pattern toplamları, state/ledger ve kabul sayıları için mutabakat özeti eklendi.
- Telegram ana raporuna fail-safe çağrılan v6.1.0 mutabakat bölümü eklendi.

## Güvenlik
- Trade Engine, Renko pusu, gerçek emir, stop, BE ve exit davranışı değiştirilmedi.
- Yeni katman yalnız shadow/bilimsel analizdir.
- Runtime state dosyaları `.gitignore` kapsamındadır.

## Test
- `npm run verify:v610`
