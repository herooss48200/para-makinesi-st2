# AGROS v3.6.6 — DNA Profit Potential Engine

## Amaç
Her DNA imzasının yalnızca TP/SL başarı oranını değil, geçmiş işlemlerde ulaşabildiği kâr seviyelerini ve en yüksek beklenen değeri üreten çıkış hedefini öğrenmek.

## Eklenenler
- Yeni `25_dna_profit_potential_engine.js` öğrenme motoru.
- DNA bazında MFE/MAE dağılımı.
- Ortalama ve medyan MFE, P25/P75/P90 kâr potansiyeli.
- Ortalama MAE ve zarar davranışı.
- `%0.20–%5.00` arası yapılandırılabilir hedef eğrisi.
- Her hedef için erişim oranı, net EV, toplam net, gerçek çıkışa fark, WR ve PF.
- DNA bazında en yüksek EV hedefi.
- `%70+` erişim eşiğine göre güvenli çıkış bölgesi.
- Ortalama kâr geri-verme analizi.
- Kapanış Telegram kartına DNA Profit Potential özeti.
- Periyodik Exit Evolution raporuna DNA Profit Potential liderleri.
- Eski replay kayıtlarını yeni modele taşıyan migration desteği.

## Güvenlik
- Trade Engine değiştirilmedi.
- Canlı TP, SL, stop ve emir kararlarına müdahale edilmedi.
- Model yalnızca kapanmış işlemler ve kayıtlı MFE/MAE/fiyat yolu verileri üzerinden öğrenir.

## Veri yorumu
Örneğin `%0.40` hedefinin başarı oranı yüksek olsa bile `%0.80` veya `%1.20` hedefi daha yüksek ortalama net EV üretiyorsa model optimum hedefi daha yukarıda gösterebilir. Karar yalnızca kazanma oranıyla değil, erişim olasılığı × net getiri dengesiyle verilir.
