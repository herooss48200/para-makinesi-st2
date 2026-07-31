# AWS — AGROS ST2 v6.10.3

## Ön koşul

- `agros-st2-gercek` stopped olmalıdır.
- Binance Futures açık pozisyon, açık normal emir ve açık Algo emir sayısı sıfır olmalıdır.
- `.env` içinde `AGROS_REAL_ORDER_ARM=DISABLED` ve `AGROS_REAL_ORDER_EXECUTION_ACK=DISABLED` kalmalıdır.
- `data/`, state, ledger ve `.env` silinmez/değiştirilmez.

## Dağıtım

1. Patch ZIP’i `/home/ubuntu/apps/para-makinesi-st2-gercek` köküne çıkarın.
2. `npm ci` ve `npm test` çalıştırın.
3. `node -e "console.log(require('./versiyon.js').kisaOzet())"` çıktısında `6.10.3-MANUAL-CLOSE-LOCK-SAFE-TRAILING` doğrulayın.
4. ARM/ACK kapalıyken botu başlatın ve startup reconciliation tamamlanınca tekrar durdurun. Bu disarmed başlangıç, açık pozisyon yoksa eski manuel rearm global kilidini kontrollü temizler.
5. `data/st2-real-order-execution-state.json` içinde `globalBlock` ve açık kayıtları kontrol edin.
6. Gerçek işlem yeniden açılacaksa ARM/ACK ancak testler, state ve Binance açık emir kontrolleri geçtikten sonra tekrar etkinleştirilir.

## Canlı doğrulama

- Operasyon satırı gerçek Score-Premier için `Score-Premier 1` göstermelidir.
- Gerçek slot `1/1` doluyken yeni sinyaller Binance emri oluşturmadan `CANLI SHADOW ÖĞRENME` olarak state’e girebilmelidir.
- Takeover aktif olduğunda stop değişim audit’i `STOP_REPLACED_ATOMIC` veya `STOP_REPLACED_SINGLE_CONSTRAINT` üretmelidir.
- `STOP_REPLACE_NEW_FAILED_OLD_KEPT` aynı aday için sürekli tekrar etmemelidir.
- Manuel kapanışta `MANUAL_EXTERNAL_CLOSE_REARM_REQUIRED` oluşmalı ve ikinci gerçek emir rezervasyonu reddedilmelidir.
