# AGROS ST2 v6.11.1 — PROFIT FLOOR & TWO SLOT / AWS

## Sürüm

`6.11.1-PROFIT-FLOOR-TWO-SLOT`

## Önemli canlı davranış

- Gerçek pozisyon limiti: `2`
- Pozisyon başına marjin: `2 USDT`
- Kaldıraç: `5x`
- Başlangıç SL: `-%1.50`
- Aktivasyon sonrası brüt taban: `+%0.40`
- Hedef minimum net: `+%0.30`
- Stop güncelleme adımı: `0.50 tamamlanmış tuğla`
- Trail mesafesi: pozisyona özel öğrenilmiş değer ve kapanışa kadar donmuş

## JASMY gibi bekleyen açık pozisyon

JASMY takeover başlamadan açık kalıyorsa restart sonrası:

- mevcut `1.75T` trail mesafesi korunur,
- güvenlik tabanı `%0.40` brüte yükselir,
- hedef minimum net `%0.30` olur,
- stop adımı `0.50T` olur,
- ikinci gerçek slot açılır.

Takeover restart öncesinde başlamışsa pozisyon geriye dönük sıkılaştırılmaz; mevcut aktif politika korunur.

## Yerel doğrulama

```powershell
npm ci
npm test
git status --short
git add .
git commit -m "fix(st2): v6.11.1 profit floor and two real slots"
git push origin main
```

## AWS dağıtımı

Açık gerçek pozisyon varken önce Binance ekranında o sembolün STOP_MARKET ve TAKE_PROFIT_MARKET korumalarının aktif olduğunu doğrula.

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
cd ~/apps/para-makinesi-st2-gercek

grep -aE "6.11.1-PROFIT-FLOOR-TWO-SLOT|BINANCE TIME|STARTUP ENTRY GATE|GERÇEK RESTART|KORUMA" \
  logs-st2/agros-st2-gercek-out.log | tail -n 120

grep -a "AGROS ST2 OPERASYON" -A 18 logs-st2/agros-st2-gercek-out.log | tail -n 20
```

Beklenen operasyon satırları:

- `Gerçek 1` veya `Gerçek 2`
- `AKTİF SCORE-PREMIER (x/2)`
- `Brüt taban %0.40`
- `Min net %0.30`
- `Stop güncelleme adımı 0.50`
- `Entry Gate READY`

## Yasaklar

- `.env` içeriğini ekrana dökme.
- `data/` klasörünü silme veya ezme.
- `git clean` kullanma.
- PM2 loglarını flush etme.
- Gerçek pozisyon açıkken EC2 reboot yapma.
