AGROS ST2 v6.12.2 FINAL R2 — GOLDEN RENKO & WILLIAMS %R SHADOW

BU PAKET, ÇALIŞAN v6.12.1 TAM REPOSU ÜZERİNE UYGULANAN GÜNCELLEMEDİR.
Önceki v6.12.2 ve FINAL paketleri kullanılmamalıdır. Bu FINAL R2 paket onların tamamının yerine geçer. Windows CRLF uyumlu v6.11.0 zincir testi içerir.

ANA GİRİŞ ZİNCİRİ:
15m kapanmış mumlar -> ATR Renko -> geçerli Renko pattern -> Renko BB teması
-> patternin öğrenilmiş Entry Evolution seviyesi (0.25T-1.50T)
-> canlı fiyat seçilen seviyenin uygun tarafında
-> 1m Renko SuperTrend aynı yön
-> Premier gerçek emir adayı / reddedilenler Shadow sanal takip.

ÖNEMLİ VARSAYILAN:
- Öğrenilmiş pattern: kendi aktif öğrenilmiş seviyesini kullanır.
- Yeni/öğrenilmemiş pattern: 0.75T ile başlar.
- Öğrenilmiş 0.25T, 0.50T, 0.75T vb. seviyeler sıfırlanmaz.

KALDIRILAN HARD GATE'LER:
- ST1 15m normal mum pususu
- ST1 3m SuperTrend
- ST1 hedef kırılımı
- referans 0T taze yeniden kırılım zorunluluğu

PREMIER:
- Premier puan matematiği değiştirilmedi.
- Premier seçilen Golden Renko sinyali gerçek emir adayıdır.
- Premier reddedilen aynı sinyal Shadow olarak açılır ve sonucu izlenir.
- Böylece Premier'in katkısı Premier/Shadow sonuçlarında karşılaştırılır.

WILLIAMS %R SHADOW:
- Yalnız kapanmış 15m ATR-Renko tuğlalarında W%R(14).
- Tepe bölgesi: -10 ile 0.
- Dip bölgesi: -100 ile -90.
- LONG: önceki T sayısı + giriş anındaki D sayısı (T2-D1 gibi).
- SHORT: önceki D sayısı + giriş anındaki T sayısı (D2-T1 gibi).
- Emir açmaz, engellemez, Premier kararını değiştirmez.
- Aynı kapanışın iki kez sayılmasına karşı duplicate koruması vardır.

KORUNANLAR:
- İki gerçek slot ve fail-closed Binance güvenlikleri
- ilk stop, +0.50 doğrudan kâr tabanı, +0.60 Renko takeover
- frozen Renko trail, MFE Capture, Exit Evolution
- mevcut Entry/Exit state, ledger ve restart güvenliği

YENİ VERİ DOSYALARI CANLIDA OTOMATİK OLUŞUR:
- data/st2-williams-cycle-shadow.json
- data/st2-williams-cycle-shadow-ledger.jsonl

UYGULAMA:
1) Paketi çalışan tam repoya kopyala. .env, data/ ve logs-st2/ silinmez.
2) npm test
3) Git commit/push
4) AWS git pull, npm ci, npm test
5) pm2 restart agros-st2-gercek --update-env
6) Loglarda GOLDEN RENKO TETİK ve W%R SHADOW kanıtlarını doğrula.
