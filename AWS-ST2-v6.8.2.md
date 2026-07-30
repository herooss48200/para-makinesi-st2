# AWS Dağıtım — AGROS ST2 v6.8.2

Bu paket ST2 sanal geliştirme botu içindir. ST151GERCEK gerçek emir klasörüne doğrudan uygulanmaz.

## 1. Ön kontrol ve yedek

```bash
cd ~/apps/para-makinesi-st2
pm2 status agros-st2
git status --short
tar -czf ~/agros-st2-data-before-v682-$(date +%Y%m%d-%H%M).tar.gz data 2>/dev/null || true
```

`data/` silinmeyecek ve reset scripti çalıştırılmayacak.

## 2. Kaynak güncelleme

Yerelde patch dosyalarını ST2 tam kaynağının üzerine yaz, test et, commit/push yap. AWS'de:

```bash
cd ~/apps/para-makinesi-st2
git pull origin main
```

## 3. Zorunlu doğrulama

```bash
npm ci
npm test
```

Beklenen ana testler:

- 101 JavaScript dosyası syntax kontrolü
- Güvenli ATR/MFE takeover regresyonu
- LAB bazlı kalıcı son-5 ve gerçek terfi/düşüş testi
- Telegram başlangıç teslim testi
- Shadow mutabakatı, süre ve kesilmeyen rapor testi
- Açılış/kapanış yaşam döngüsü, bilimsel ayrım ve aynı-evren replay testi

Testlerden biri başarısızsa PM2 restart yapılmaz.

## 4. Restart

```bash
pm2 restart agros-st2 --update-env
pm2 save
pm2 logs agros-st2 --lines 200
```

## 5. İlk canlı doğrulamalar

Telegram başlığı `6.8.2-OPERATION-LIFECYCLE-REPORT-TRUTH` olmalı ve mod `SANAL` kalmalı.

Kontrol et:

- Açılış mesajında Giriş Kararı / Açılış Yönetim Planı / Sabitlenenler / Dinamik Çalışacaklar
- Kapanışta Gerçekleşen Yönetim ve K0/K1/K2/K3 zaman çizelgesi
- Ayrı `ST2 BİLİMSEL KAPANIŞ ANALİZİ` mesajı
- Shadow `N = TP + SL + BE`
- Liglerde gerçek oturum terfi/düşüş ile canlı koşul sayılarının ayrılması
- Canlı raporun satır ortasında kesilmemesi
- `State = Ledger` mutabakatının korunması

## Geri dönüş

Kod geri alınacaksa önce PM2 durdurulur, önceki commit checkout edilir; `data/` üzerine eski veya boş dosya yazılmaz. Yeni `liveLeagueByLab` ve `leagueTransitions` alanları geriye dönük uyumludur, veri reseti gerektirmez.
