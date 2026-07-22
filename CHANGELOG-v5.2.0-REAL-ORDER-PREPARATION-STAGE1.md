# AGROS v5.2.0 — Gerçek Emir Hazırlığı / Aşama 1

## Kapsam

Trade Engine'e ve gerçek emir yetkisine dokunmadan aşağıdaki bilimsel denetimleri tek raporda toplar:

- Sabit stop adayları: %1.0, %1.2, %1.5; %1.8 için ileri fiyat-yolu gözlem zorunluluğu
- BE ve BE+ adaylarının MFE tabanlı Shadow projeksiyonu
- Exit replay kapsamı, canlı atama kullanımı ve zaman bazlı Exit yoğunluğu
- Gerçek Exit ile seçilen Shadow Exit net/PF farkı
- Tarihsel Premier, Son-5 ve Reverse Premier defter ayrımı

## Güvenlik

- Emir açma kararı değişmez.
- Aktif pozisyon stopu değişmez.
- Gerçek emir yetkisi açılmaz.
- Daha geniş stoplar geçmiş veriden uydurulmaz; `FORWARD_OBSERVATION_REQUIRED` olarak raporlanır.

## Çalıştırma

```bash
node 67_real_order_preparation_intelligence.js /path/to/data /path/to/output
```

Çıktılar:

- `real-order-preparation-intelligence.json`
- `real-order-preparation-intelligence.txt`
