# AGROS v5.0.0 — Entry Chain Reliability

## Kök neden
`SNIPER TETİĞİ` sonrasında Blackbox açılış snapshotı, temel sanal pozisyon state kaydından önce bekleniyordu. Binance mum isteği asılı kaldığında pozisyon zinciri sonuç üretmeden durabiliyordu.

## Düzeltmeler
- Blackbox mum isteklerine 5 saniye timeout eklendi.
- Tam açılış snapshotına 7 saniye timeout eklendi.
- Sanal pozisyon temel state ve kalıcı hafızaya yardımcı katmanlardan önce yazılıyor.
- LAB, Intelligence, Exit scoreboard, Blackbox kayıt ve Telegram hataları ana açılışı bloke etmiyor.
- Başarılı girişlerde `ENTRY_SUCCESS`, başarısız dönüşlerde `ENTRY_ABORT:*` terminal kayıtları üretiliyor.
- Trade Engine stratejisi, pusu, kırılım, SuperTrend, SL/TP ve öğrenilmiş `data/` formatları değiştirilmedi.

## Değiştirilen dosyalar
- `motor.js`
- `4_pozisyon.js`
- `8_blackbox.js`
- `ayarlar.js`
- `versiyon.js`
- `package.json`
- `package-lock.json`
- `test_v500_entry_chain_reliability.js`

## Doğrulama
- `npm run test:v500`
- `npm run test:v460`
- `npm run test:v492`
- `npm run check` (tüm mevcut test zinciri)
