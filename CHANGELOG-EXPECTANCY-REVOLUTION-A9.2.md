# A9.2 – Intelligence Telegram Trigger Fix

- Intelligence Dashboard tetikleyicisindeki `oneCikar` erken çıkış koşulu kaldırıldı.
- Dashboard kontrolü her canlı rapor çevriminde çalışır; ancak yalnızca başlangıçta bir kez ve gerçek TP/SL/BE sayacı değiştiğinde Telegram mesajı gönderir.
- Stop güncellemeleri, periyodik portföy yenilemeleri ve Restart Gap muhasebe kapanışları ek mesaj üretmez.
- Trade Engine ve pozisyon yönetimi değiştirilmedi.
