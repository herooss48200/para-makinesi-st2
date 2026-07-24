# v5.5.9-fix.2 — ST2 Renko Identity Close Binding

## Düzeltilen hata
ST2 Renko işlem kimliği yalnız `girisAnalizi` alt alanına bağlıydı. Eski/açık pozisyonlarda veya kimlik zincirinde alan üst seviyede kaldığında kapanış evrimi işlemi ST2 Renko olarak tanıyamıyordu.

## Onarım
- `motor.js`: giriş stratejisi `entryStrategyMode` ile güvenli şekilde kanonikleştirildi ve hem pozisyon üst seviyesine hem `girisAnalizi` içine yazıldı.
- `4_pozisyon.js`: bilimsel kapanıştan önce ST2 pattern/referans/box/tuğla kimliği kanonik `girisAnalizi` nesnesinde tamamlanıyor.
- `73_st2_renko_entry_evolution.js`: üst seviye ve pusu snapshot kimliklerinden geriye uyumlu kapanış kimliği kurtarılıyor.
- Yeni test gerçek eski pozisyon biçiminde `bridge.calls=1`, `bridge.accepted=1`, `closed=1` doğruluyor.

Trade Engine giriş/çıkış kararı değiştirilmemiştir; yalnız öğrenme kimliği ve kapanış köprüsü onarılmıştır.
