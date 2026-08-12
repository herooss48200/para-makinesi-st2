# AWS Deploy — AGROS ST2 v6.13.5-R23.2

Kaynak otoritesi: GitHub `main`. AWS üzerinde elle patch yapılmaz.

1. Yerelde `npm run test:fast` ve `npm run test:full` geçmeli.
2. Commit/push sonrası AWS: `git fetch origin && git pull --ff-only origin main`.
3. AWS üzerinde `npm run test:v6166` ve `npm run test:fast` geçmeli.
4. Açık gerçek pozisyon yoksa `pm2 restart agros-st2-gercek`.
5. Panelde sürüm R23.2, Entry Gate READY ve Mode D/C `0/N` doğrulanır.
