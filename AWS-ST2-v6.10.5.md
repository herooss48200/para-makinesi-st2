# AWS Dağıtım — v6.10.5

1. Açık gerçek pozisyon varsa doğal kapanışı tercih edin veya restart mutabakatının pozisyonu koruduğunu doğrulayın.
2. `git pull --ff-only origin live-v6.9.3`
3. `npm ci`
4. `npm test`
5. `pm2 restart agros-st2-gercek --update-env`
6. Telegram operasyon panelinde `Aktif Pozisyonlarda Exit Replay` satırını doğrulayın.
7. Restart-GAP kapanışında Entry N>0 ise `Giriş kanıtlı` açıklamasını doğrulayın.
