# AGROS ST2 v5.6.2 — Recovery Sprint

## Kapsam
- Trade Engine, emir açma, Stop, BE ve Exit davranışları değiştirilmedi.
- Pusu Telegram bildirimi aynı runtime içindeki aynı sembol + Renko Pattern imzası için yalnız ilk oluşumda gönderilir.
- Entry Evolution tarihsel kurtarma, canlı state kısmen dolu olsa bile daha güçlü eski state'i bulur ve geri yükler.
- 0.25, 0.50, 0.75, 1.00, 1.25 ve 1.50 replay seviyeleri korunur.
- Canlı Telegram ana raporu sadeleştirildi; Entry Evolution ayrıntıları ayrı ikinci mesaj olarak gönderilir.
- Eski “Rapor güvenlik nedeniyle kısaltıldı” metni kaldırıldı.

## Doğrulama
- `npm run verify:v562`
- `npm run verify:st2`
