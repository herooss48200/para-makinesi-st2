# AWS Dağıtımı — AGROS ST2 v6.10.0

## Kesin güvenlik kuralı

İlk kurulum ve restart mutabakatı sırasında gerçek emir ARM kapalı tutulmalıdır. Açık Binance pozisyonları ve Algo korumaları doğrulanmadan yeni giriş yetkisi verilmez.

## 1. Yalnız gerçek botu durdur

```bash
pm2 stop agros-st2-gercek
pm2 status
```

Sanal bot çalışıyorsa ona dokunma.

## 2. Mevcut gerçek klasörü ve data'yı yedekle

```bash
cd ~/apps
cp -a para-makinesi-st2-gercek "para-makinesi-st2-gercek-backup-$(date +%Y%m%d-%H%M%S)"
```

`data/`, `.env`, ledger ve öğrenme dosyalarını silme veya paket içeriğiyle ezme.

## 3. Patch dosyalarını gerçek bot klasörüne kopyala

Paket yalnız değişen kaynakları içerir. ZIP'i gerçek bot klasörünün köküne aç.

```bash
cd ~/apps/para-makinesi-st2-gercek
unzip -o /DOSYA/YOLU/AGROS-ST2-v6.10.0-REAL-ORDER-EXECUTION-SAFETY.zip
```

## 4. Ortam ayrımını doğrula

Gerçek bot `.env` örneği:

```dotenv
BINANCE_BASE_URL=https://fapi.binance.com
AGROS_REAL_ORDER_ENV=MAINNET
AGROS_REAL_ORDER_ARM=DISABLED
AGROS_REAL_ORDER_EXECUTION_ACK=DISABLED
AGROS_DATA_DIR=/home/ubuntu/apps/para-makinesi-st2-gercek/data
```

- Gerçek ve sanal bot aynı `AGROS_DATA_DIR` kullanmamalıdır.
- Gerçek API anahtarı yalnız gerçek bot klasöründe olmalıdır.
- İlk başlangıçta `AGROS_REAL_ORDER_ARM=LIVE_TRADING_CONFIRMED` yapma.
- İlk başlangıçta `AGROS_REAL_ORDER_EXECUTION_ACK=DISABLED` bırakılmalıdır. Kontroller bittikten sonra `V610_REVIEWED` yapılır; eski `.env` ARM değerinin tek başına canlı emri açması böylece engellenir.
- `ayarlar.js` içindeki onay kodu ile ARM değeri birebir eşleşmedikçe yeni emir gönderilmez.

## 5. Bağımlılıkları kilit dosyasından kur

```bash
npm ci
npm ls binance-api-node ws
```

Beklenen temel sürümler:

- `binance-api-node@0.13.10` (tam sürüm kilidi)
- `ws@7.5.11`

Algo Service metotları bulunamazsa gerçek giriş fail-closed reddedilir.

## 6. Testleri çalıştır

```bash
npm test
```

Beklenen son satırlar:

```text
✅ AGROS ST2 v6.9.5 strict configurable live risk controls passed
✅ v6.10.0 real order execution safety tests passed
```

## 7. Kaynak ve paket kontrolü

```bash
node --check 85_st2_real_order_execution.js
node --check motor.js
node --check 3_piyasa.js
node --check 4_pozisyon.js
node -e "console.log(require('./versiyon.js').kisaOzet())"
```

Beklenen sürüm:

```text
6.10.0-REAL-ORDER-EXECUTION-SAFETY
```

## 8. ARM kapalıyken ilk başlangıç

```bash
pm2 start bot.js --name agros-st2-gercek
pm2 logs agros-st2-gercek --lines 250
```

Şunları doğrula:

- `GERÇEK RESTART MUTABAKATI`
- açık pozisyon sayısı
- kalıcı geri yüklenen/adopted pozisyon sayısı
- koruma hatası `0`
- `STATE_CORRUPTION_NO_RECOVERY` yok
- `IKINCI_GERCEK_BOT_SURECI` yok
- `HARICI_ACIK_EMIR_MUTABAKATI_GEREKLI` yok
- açık gerçek pozisyonların Binance Algo SL ve TP emirleri var
- pozisyonu olmayan sembollerde `AGST2` önekli orphan normal/Algo emir yok
- her pozisyonda yalnız bir aktif AGROS STOP ve bir aktif AGROS TAKE_PROFIT var
- restartta kapanmış işlem varsa `GERÇEK RESTART KAPANIŞ MUTABAKATI` mesajı ve execution audit kaydı var

Runtime dosyaları:

```bash
ls -lah "$AGROS_DATA_DIR"/st2-real-order-execution-*
cat "$AGROS_DATA_DIR"/st2-real-order-execution-state.json
 tail -100 "$AGROS_DATA_DIR"/st2-real-order-execution-audit.jsonl
```

## 9. Binance tarafını manuel doğrula

Her açık gerçek pozisyon için:

- one-way mode / `positionSide=BOTH`
- doğru yön ve gerçek miktar
- doğru isolated/crossed marjin
- doğru kaldıraç
- bir adet AGROS stop Algo emri
- bir adet AGROS take-profit Algo emri
- AGROS dışı belirsiz açık emir olmaması

Harici emir varsa bot üstüne koruma eklemez; önce manuel mutabakat gerekir.

## 10. Yeni giriş ARM'ını aç

Yalnız testler, restart mutabakatı ve Binance korumaları doğrulandıktan sonra:

```bash
pm2 stop agros-st2-gercek
```

`.env`:

```dotenv
AGROS_REAL_ORDER_ARM=LIVE_TRADING_CONFIRMED
AGROS_REAL_ORDER_EXECUTION_ACK=V610_REVIEWED
```

Sonra:

```bash
pm2 start agros-st2-gercek
pm2 logs agros-st2-gercek --lines 250
```

İlk gerçek işlemde şu zinciri eksiksiz gör:

1. `GERÇEK EMİR KALICI KİLİT/PREFLIGHT`
2. deterministik `Client AGST2...`
3. `GERÇEK FILL MUTABAKATI`
4. `ALGO KORUMA`
5. `GERÇEK ALGO KORUMA HAZIR`
6. state dosyasında `status: OPEN`

## 11. Acil durdurma

```bash
pm2 stop agros-st2-gercek
```

Açık pozisyon varsa botu durdurmak Binance'taki Algo koruma emirlerini silmez. Pozisyon ve korumaları Binance arayüzünden ayrıca doğrula.

## 12. Fail-closed durumlarında ARM açma

Aşağıdakilerden biri varsa yeni gerçek girişe izin verme:

- `STATE_CORRUPTION_NO_RECOVERY`
- `RESTART_KORUMA_MUTABAKATI_BASARISIZ`
- `GERCEK_POZISYON_KAPATILAMADI`
- `GERCEK_ACILIS_ROLLBACK_BASARISIZ`
- `HARICI_ACIK_EMIR_MUTABAKATI_GEREKLI`
- `HEDGE_MODE_DESTEKLENMIYOR`
- `IKINCI_GERCEK_BOT_SURECI`
- `DOLUM_SONRASI_AKTIF_POZISYON_LIMITI_ASILDI`
- `ORPHAN_AGROS_EMIRLERI_TEMIZLENEMEDI`
- `CIFT_STOP_KORUMA_MUTABAKATSIZLIGI`
- `RESTART_KAPANIS_MUTABAKATI_BASARISIZ`
- `KAPANIS_SONRASI_KORUMA_IPTAL_EDILEMEDI`
- `KAPANIS_MUHASEBESI_DOGRULANAMADI`
- `AGROS_NORMAL_EMIR_IPTAL_EDILEMEDI`
- `ALGO_KAPANIS_DURUMU_DOGRULANAMADI`

## 13. Rollback

```bash
pm2 stop agros-st2-gercek
cd ~/apps
rm -rf para-makinesi-st2-gercek
mv para-makinesi-st2-gercek-backup-YYYYMMDD-HHMMSS para-makinesi-st2-gercek
cd para-makinesi-st2-gercek
npm ci
pm2 start bot.js --name agros-st2-gercek
```

Rollback öncesinde ve sonrasında Binance açık pozisyonları ile koruma emirlerini manuel doğrula. Eski sürüm Algo Service uyumlu değilse açık gerçek pozisyon varken eski sürümü çalıştırma.
