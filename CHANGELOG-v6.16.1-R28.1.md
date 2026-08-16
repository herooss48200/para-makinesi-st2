# AGROS ST2 v6.16.1-R28.1 — HA STRICT 3-STAGE + FORMATION CONTEXT

## Kesin HA giriş sözleşmesi
R28.1, HA gerçek girişini üç ayrı zamansal aşamaya böler; aynı mum iki görevi üstlenemez.

1. **Pusu mumu:** kapanmış 15m Heikin Ashi mumu. LONG için kırmızı-alt BB; SHORT için yeşil-üst BB. BB'ye yaklaşma/değme/dışarı taşma mantığı korunur.
2. **Teyit mumu:** pusu mumundan sonra en fazla 3 kapanmış 15m HA mum içinde karşı renk mum tamamen kapanmalıdır. LONG için yeşil, SHORT için kırmızı. Tetik seviyesi yalnız dolu gövde sınırıdır; iğne kullanılmaz.
3. **Tetik mumu:** teyit mumundan **hemen sonraki tek 15m mum**. Yalnız bu mum çalışırken gerçek Binance fiyatı teyit gövdesini kırarsa REAL açılır. Bu mum kapanana kadar kırılım yoksa sinyal `HA TETİK MUMU EXPIRED` ile biter; eski teyit sonraki mumlarda kovalanmaz.

Bu nedenle çalışan mum teyit sayılmaz ve teyit mumu kendi içinde tetik mumu olamaz.

## Formasyon zekâsı
- Fincan/kulp geometrisi 15m HA serisinde etiketlenir.
- Butterfly X-A-B-C-D yapısı gerçek 15m kaynak fiyat pivotları ve Fibonacci yakınsaması ile aranır.
- Güçlü bullish HH/HL devam yapısında, açık bearish dönüş formasyonu yoksa sıradan HA SHORT veto edilir (`SHORT_AGAINST_BULLISH_STRUCTURE`).
- Güçlü bearish LL/LH devam yapısında, açık bullish dönüş formasyonu yoksa sıradan HA LONG veto edilir (`LONG_AGAINST_BEARISH_STRUCTURE`).
- Büyük düşüş sonrası dip/fincan bölgesinde SHORT ve karşıt Butterfly PRZ hâlâ veto nedenidir; ayna kuralları LONG için geçerlidir.

## Operasyon
- Gerçek pozisyonlu sembolde yeni HA pususu kurulmaz; eski HA pususu temizlenir.
- Restartta HA pusuları tek tek Telegram'a yağdırılmaz; açılış özeti gönderilir, sonra yalnız yeni pusular bildirilir.
- Panelde aktif HA pusuları, teyit/tetik aşaması ve formasyon özeti görünür.
- RENKO zinciri değişmedi.
- Slotlar RENKO 10 + HA 10; toplam 20.
- Ortak stop ekonomisi değişmedi: ilk SL -%2.50; +%1.50 MFE sonrası +%1.00; sonra %0.50 geriden / 0.50 puan adım.
- Mevcut açık pozisyonlar otomatik kapatılmaz; kurallar yalnız yeni HA girişlerine uygulanır.
