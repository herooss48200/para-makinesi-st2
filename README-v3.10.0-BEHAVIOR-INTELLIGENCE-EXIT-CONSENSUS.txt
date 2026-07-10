PARA MAKİNESİ BINANCE v3.10.0
BEHAVIOR INTELLIGENCE PLATFORM + EXIT CONSENSUS ENGINE

Yeni dosyalar:
- 31_behavior_intelligence_engine.js
- 32_exit_consensus_engine.js

Entegrasyon:
- 22_exit_replay_engine.js her kapanışta iki yeni modeli mevcut özetlerden üretir.
- Telegram BLACKBOX kapanış analizinde DNA BEHAVIOR INTELLIGENCE ve EXIT CONSENSUS ENGINE bölümleri görünür.
- package.json / package-lock.json sürümü 3.10.0'dır.
- versiyon.js: 3.10.0-EXIT-CONSENSUS.

Güvenlik:
- Trade Engine, giriş, TP, SL, trailing stop ve gerçek kapanış kararı değiştirilmedi.
- Yeni katmanlar yalnızca öğrenme ve açıklanabilir öneri üretir.
- Restart Gap karantinası korunur.
- Minimum örnek eşiği varsayılan 10'dur.

Yerel kontrol:
  npm install
  npm run check
  npm start
