# AGROS ST2 v6.11.2 — DIRECT PROFIT FLOOR & TWO SLOT / AWS

## Canlı ayarlar

```js
gercekEmirMaxAktifPozisyon: 2,
renkoCikisKarTabaniAktivasyonYuzde: 0.50,
renkoCikisCanliAktivasyonYuzde: 0.60,
renkoCikisGuvenliKarTabaniYuzde: 0.40,
renkoCikisMinimumNetKarYuzde: 0.30,
renkoCikisStopGuncellemeAdimTugla: 0.50,
```

Canlı aktivasyon doğrudan `%0.60` ayarıdır; `tpAdimYuzdesi × kademe` veya başka bir iki kat kuralı kullanılmaz.

## JASMY gibi bekleyen pozisyon

Takeover başlamamışsa restart sonrası:

- mevcut öğrenilmiş trail mesafesi korunur,
- `%0.50` taban tetik seviyesi atanır,
- brüt `%0.40` taban ve yaklaşık net `%0.30` hedef atanır,
- doğrudan `%0.60` Renko aktivasyonu atanır,
- `0.50T` stop güncelleme adımı atanır.

Takeover zaten aktifse eski donmuş politika kapanışa kadar korunur.

## Yerel doğrulama

```powershell
cd "C:\Users\ASUS\OneDrive\Desktop\ArgosPlatform\Repositories\ParaMakinesiBinance\ST151GERCEK-GIT"
npm ci
npm test
git status --short
git add .
git commit -m "fix(st2): v6.11.2 direct profit floor and two slots"
git push origin main
```

## AWS dağıtımı

Açık gerçek pozisyon varken önce Binance ekranında STOP_MARKET ve TAKE_PROFIT_MARKET korumalarını doğrula.

```bash
cd ~/apps/para-makinesi-st2-gercek

pm2 status
git status --short
git log -1 --oneline

BACKUP="$HOME/backups/agros-st2-gercek-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -a .env data "$BACKUP"/

git pull origin main
npm ci
npm test

pm2 restart agros-st2-gercek --update-env
pm2 status
```

## Başlangıç kanıtı

```bash
grep -aE "6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT|BINANCE TIME|STARTUP ENTRY GATE|GERÇEK RESTART|KORUMA" \
  logs-st2/agros-st2-gercek-out.log | tail -n 150

grep -a "AGROS ST2 OPERASYON" -A 20 logs-st2/agros-st2-gercek-out.log | tail -n 22
```

Beklenen görünüm:

- `AKTİF SCORE-PREMIER (x/2)`
- `Taban tetik %0.50`
- `Brüt taban %0.40`
- `Min net %0.30`
- `Renko aktivasyon %0.60`
- `Entry Gate READY`

## Yasaklar

- `.env` içeriğini ekrana dökme.
- `data/` klasörünü silme veya ezme.
- `git clean` kullanma.
- PM2 loglarını flush etme.
- Gerçek pozisyon açıkken EC2 reboot yapma.
