# AGROS ST1 v5.3.4 — Negative League & Reverse Validation

- En düşük ekonomiye sahip LAB DNA'lar yön bazında sıralanır.
- Negative League: en kötü 10 LONG + en kötü 10 SHORT.
- Giriş şartı: N>=5, Net<0, PF<1, Expectancy<0.
- Aynı sinyalde ikinci pozisyon açılmaz; mevcut tek sanal pozisyon ters yönde yürütülür.
- Negative League işlemleri ana kasa, Premier kasa ve gerçek emir yetkisine dahil edilmez.
- Stop, BE+, Exit ve öğrenme kayıtları çalışmaya devam eder.
- Ters gölge defteri N>=5, Net>0, PF>1 ve Expectancy>0 üretirse Reverse Premier adayı olarak işaretlenir.
- Adaylık otomatik gerçek emir yetkisi vermez.
- Telegram'da toplam Negative League, LONG/SHORT dağılımı, ters gölge Net/PF ve aday sayısı gösterilir.
