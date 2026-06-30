# PARA MAKİNESİ BINANCE - AWS Stable v2.1.1

Bu paket GitHub ana kaynak, AWS stable çalıştırma modeli için hazırlanmıştır.

## Çalıştırma

```bash
npm install
npm run check
pm2 start ecosystem.config.js
pm2 save
```

## Güncelleme akışı

Yerel geliştirme:

```bash
git add .
git commit -m "AWS Stable v2.1.1"
git push
```

AWS:

```bash
git pull
npm install
npm run check
pm2 restart para-makinesi
pm2 logs para-makinesi
```

## Güvenlik

Varsayılan mod `ayarlar.js` içinde `sanalEmirModu: true` olarak bırakılmıştır. Bu modda Binance'e gerçek emir gönderilmez.
