# AWS Dağıtımı — AGROS ST2 v6.9.0 FINAL

## Güvenlik

- Sunucudaki `.env` dosyasını koruyun; ZIP içinde `.env` yoktur.
- Sunucudaki `data/`, state ve ledger kayıtlarını koruyun; paket bunları içermez ve silmez.
- Mevcut botu durdurmadan önce yedek/geri dönüş commitini not edin.
- Gerçek emir yetkisi bu sürümle otomatik açılmaz; fail-closed ayarlar korunur.

## Önerilen GitHub dağıtımı

```bash
cd ~/apps/para-makinesi-st2
git status --short
git pull --ff-only origin main
npm ci
npm test
pm2 restart agros-st2 --update-env
pm2 logs para-makinesi-st2 --lines 150
```

## ZIP ile tam kaynak güncellemesi

ZIP'i geçici bir klasöre açın. Sunucudaki `.env` ve `data/` klasörünü silmeden kaynak dosyalarını uygulama klasörüne kopyalayın. Ardından:

```bash
npm ci
npm test
pm2 restart agros-st2 --update-env
pm2 logs para-makinesi-st2 --lines 150
```

## İlk canlı doğrulama

- Sürüm: `6.9.0-FINAL-PREMIER-SCORE-200-COIN`
- Evren: hedef `200/200`; daha azsa veri sağlığı `DEGRADED` olmalı ve gerçek sayı görünmelidir.
- State/Ledger mutabakatı korunmalı.
- Telegram'da evren, yükleme süresi, mum/ST hazırlığı ve tarama süresi görünmeli.
- Premier/Shadow kararlarında skor/eşik/sıra ve açık gerekçe görünmeli.
- Açılış/kapanış mesajlarında Entry Replay, Exit Replay ve Takeover Replay ayrı olmalı.
- `Exit FALLBACK N0`, Takeover öğrenmesinin N değerini değiştirmemeli veya onunla karıştırılmamalı.

## Geri dönüş

Beklenmeyen davranışta önce yeni girişleri durdurun, açık pozisyonların korunmasını doğrulayın ve önceki sağlam Git commitine yalnız fast-forward/planlı geri dönüş prosedürüyle dönün. `data/` kayıtlarını resetlemeyin.
