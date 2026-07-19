AGROS v5.0.2 — SHARED REQUEST QUEUE

GÜVENLİK
- Bu dağıtım paketinde data/ yoktur.
- .env yoktur.
- Mevcut AWS öğrenme ve kimlik kayıtlarının üzerine yazmaz.

YEREL GIT
1) ZIP içindeki repo dosyalarını mevcut repo üzerine kopyalayın.
2) PowerShell:
   git add .; git commit -m "v5.0.2 Shared Request Queue and Safe Registry Lock"; git push; git tag v5.0.2-shared-request-queue; git push origin v5.0.2-shared-request-queue

AWS TEK BLOK
cd ~/apps/para-makinesi-binance && git pull && npm install && npm run verify:v502 && pm2 restart para-makinesi --update-env && pm2 flush && pm2 logs para-makinesi --lines 120

BEKLENEN
- Açılışta 5.0.2-SHARED-REQUEST-QUEUE görünür.
- Heartbeat satırı Ağ: OK / Hata / Retry / Birleşen / Kuyruk sayılarını gösterir.
- Eski sembol başına socket/TLS hata satırları pm2 flush sonrası görünmez.
