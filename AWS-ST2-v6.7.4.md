# AWS Deployment — AGROS ST2 v6.7.4

```bash
cd ~/apps/para-makinesi-st2
npm test
pm2 restart agros-st2 --update-env
pm2 save
sleep 25
pm2 logs agros-st2 --lines 120 --nostream
```

Başarılı açılış kanıtları:

- `6.7.4-TELEGRAM-STARTUP-RELIABLE-DELIVERY`
- `[ST2 STARTUP TELEGRAM] Tekil kritik teslim doğrulandı — güvenilir startup hattı`
- Telegram'da `PARA MAKİNESİ BOTU AKTİF`

Not: Telegram token'ı daha önce loglarda açığa çıktıysa BotFather üzerinden yenilenmelidir.
