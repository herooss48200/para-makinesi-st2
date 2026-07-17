# v4.2.9 — Sizing Guard + Clean Start

- Championship gerçek emir boyutu ayardaki normal pozisyonun x0.25’i olarak kalır.
- Ölçeklenmiş miktar Binance `minQty` veya `minNotional` şartını karşılamazsa emir API’ye gönderilmeden atlanır; risk miktarı otomatik büyütülmez.
- Açılış Telegram mesajından eski net PNL kaldırıldı.
- Canlı portföy ekranında eski toplam açılan/TP/SL/başarı/komisyon/net kasa varsayılan olarak gizlendi.
- Eski veriler `data/sanal-state.json` içinde korunur ve öğrenme/analiz modüllerinde kullanılmaya devam eder.
