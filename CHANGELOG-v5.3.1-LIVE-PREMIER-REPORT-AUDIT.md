# AGROS ST1 v5.3.1 — Live Premier Report Audit

## Kapsam
Bu sürüm yalnız canlı Premier raporu ile En Karlı / En Riskli aktif işlem listelerini düzeltir. Trade Engine, giriş, stop, BE ve exit yürütme mantığı değiştirilmemiştir.

## Düzeltmeler
- En Karlı ve En Riskli listeleri sabit 5 yerine aktif ana Premier sayısı kadar, maksimum 10 kayıt gösterir.
- Reverse Premier, Bottom deneyleri, gölge ve Restart-GAP kayıtları ana Premier listelerine dahil edilmez.
- Sıralama için öncelikle `state.canliFiyatlar` ve işlem giriş fiyatından hesaplanan canlı PnL kullanılır.
- Canlı fiyat bulunamazsa pozisyondaki son fiyat; o da bulunamazsa kayıtlı PnL alanları fallback olarak kullanılır.
- Premier aktif sayısı rapordaki filtrelenmiş ana Premier listesiyle aynı kaynaktan hesaplanır.

## Doğrulama
```bash
npm run verify:v531
```

Test; 12 ana Premier, 1 Reverse, 1 GAP ve 1 gölge pozisyonlu sentetik veriyle filtreleme, maksimum 10 sınırı ve canlı PnL sıralamasını doğrular.
