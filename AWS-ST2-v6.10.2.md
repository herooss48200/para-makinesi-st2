# AWS — AGROS ST2 v6.10.2

1. `agros-st2-gercek` durmuş, ARM/ACK `DISABLED` kalmalıdır.
2. Paketi repo köküne çıkarın; `data/`, `.env`, log ve state dosyaları pakette yoktur.
3. `npm ci && npm test` çalıştırın.
4. `node -e "console.log(require('./versiyon.js').kisaOzet())"` ile v6.10.2 doğrulayın.
5. Ayarlar kontrolü: `calisilmakIstenenUsdtMiktar: 2`, `mevcutKaldirac: 5`, `gercekEmirMaxAktifPozisyon: 1`. Notional çalışma anında 10 USDT türetilir.
6. Önce ARM/ACK kapalı smoke test yapın. Mevcut v6.10.1 rollback kayıtları korunur.
7. Global block varsa temizliği yalnız açık pozisyon/emir/Algo emirleri sıfır doğrulandıktan ve v6.10.2 smoke testi geçtikten sonra kontrollü yapılır.

8. v6.10.1 rollback kök nedeni olan Algo GET/CANCEL `symbol` zorunluluğu v6.10.2 testinde doğrulanır.

- Pozisyon limiti motor parametresi veya runtime kaydı tarafından ezilemez; yürütme katmanı her kontrolde `ayarlar.js` kaynağını okur.
