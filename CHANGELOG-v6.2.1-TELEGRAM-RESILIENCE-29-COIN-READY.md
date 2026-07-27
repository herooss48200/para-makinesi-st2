# AGROS ST2 v6.2.1

- Telegram gönderimleri tek kuyrukta sıraya alındı.
- Varsayılan Telegram zaman aşımı 30 saniyeye çıkarıldı.
- Geçici timeout/ağ/429 hatalarında en fazla 2 kontrollü yeniden deneme eklendi.
- İstekler arasında varsayılan 400 ms güvenli aralık eklendi.
- Testnet tarafından desteklenmeyen PEPEUSDT tarihsel havuzdan çıkarıldı.
- Global tarihsel hazır olma hedefi 29 coin olarak sabitlendi; mevcut 29 öğrenme tam hazır kabul edilir.
- Trade Engine, stop, BE, exit ve gerçek emir yetkisi değiştirilmedi.
