AGROS / Para Makinesi Binance v3.4.2 - CLUSTER INTELLIGENCE

Amaç:
- En başarılı imzaların kesişen kümelerini artık yalnızca listelemek değil, kazanan ve kaybeden kümeleri karşılaştırmak.
- Success Cluster + Risk Cluster arasındaki ayrışmayı ölçmek.
- Gelecekte Adaptive Trade Manager için pozitif karar çekirdeği ve risk çekirdeği üretmek.

Yeni modül:
- 17_cluster_intelligence_engine.js

Üretilen çıktılar:
- data/agros-cluster-intelligence-engine.json
- data/agros-cluster-intelligence-engine.csv

Ölçülen başlıklar:
- SAF_KAZANAN
- KAZANAN_AGIRLIKLI
- SAF_RISK
- RISK_AGIRLIKLI
- CELISKILI_KUME
- NÖTR/İZLE

Önemli not:
- Trade Engine değişmedi.
- Emir açma, kapama, stop taşıma, filtreleme yapılmaz.
- Bu sürüm sadece öğrenme/rapor/console katmanıdır.

Yol haritasındaki yeri:
- v3.4.0 Exit Optimizer Foundation
- v3.4.1 Success Cluster Foundation
- v3.4.2 Cluster Intelligence
- Sonraki hedef: v3.4.3 Similarity Scoring / işlem benzerlik skoru
