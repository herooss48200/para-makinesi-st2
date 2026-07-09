# Para Makinesi Binance v3.2.8 - Live Intelligence Monitor

Bu sürüm Intelligence Layer üzerine eklenen izleme katmanıdır.

## Amaç
Confidence Engine tarafından üretilen güven skorlarının gerçek kapanış sonuçlarıyla ne kadar uyumlu olduğunu ölçmek.

## Eklenenler
- 13_live_intelligence_monitor.js
- Confidence skor bucket kalibrasyonu
- Yüksek güven ama zayıf sonuç veren DNA uyarıları
- Düşük güven görünüp iyi çalışan fırsat DNA tespiti
- JSON/CSV console export:
  - data/agros-live-intelligence-monitor.json
  - data/agros-live-intelligence-monitor.csv

## Güvenlik
- Trade Engine değiştirilmedi.
- Emir açma/kapatma mantığına dokunulmadı.
- Bu katman sadece raporlama ve analiz üretir.
- .env, .git, node_modules ve data pakete dahil edilmez.
