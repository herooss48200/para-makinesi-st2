# Para Makinesi Binance v2.2.0 – BlackBox Full Analysis

Bu sürüm strateji mantığını değiştirmez. Amaç AWS/yerel sanal çalışmada 4 gün boyunca analiz edilebilir veri toplamaktır.

## Eklenenler
- Her pozisyon açılışında BTCUSDT ve işlem coini için 5m / 15m / 1h / 4h SuperTrend fotoğrafı.
- Her pozisyon kapanışında aynı trend fotoğrafı.
- Telegram açılış ve kapanış mesajlarında trend matrisi, toplam uyum skoru ve Bollinger bölgesi.
- Ana Telegram raporunda BlackBox trend etkisi: LONG/SHORT, BTC tam uyum, coin tam uyum, 8/8 uyum, zayıf uyum, Bollinger orta bant etkisi.
- JSONL kayıt: `data/blackbox-snapshots.jsonl`
- CSV kayıt: `data/blackbox-trades.csv`
- BE tamponu `%0.12`; başabaşın komisyon sonrası zararda kapanmasını azaltmak için BE+ koruması.
- Kasa sınıflandırması kapanış sebebine göre TP / SL / BE olarak ayrılır; BE+ net küçük kâr olsa bile BE sınıfında izlenir.

## Not
BlackBox sadece ölçüm katmanıdır. Pusu, sniper, trend onayı ve emir açma mantığına müdahale etmez.
