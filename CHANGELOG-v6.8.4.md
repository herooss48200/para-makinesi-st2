# AGROS ST2 v6.8.4 — Minimal Telegram Operation Proof

- İşlem açılış Telegram mesajı yeniden etkinleştirildi.
- Açılışta giriş atamasının N, PF, expectancy, net ve karar gerekçesi gösterilir.
- Açılışta exit replay atamasının algoritması, N, beat rate, PF, net ve gerekçesi gösterilir.
- K0 başlangıç stopu, BE+, takeover, ATR ve MFE capture planı görünür kalır.
- Takeover devralma bildirimi korunur.
- Kapanışta K0/K1/K2 yolculuğu, MFE, MAE, capture, giveback ve kapanış kaynağı gösterilir.
- Kapanışta gerçek kademe sonucu ile seçilen replay exit sonucu ve farkı gösterilir.
- Ağır toplu replay/DNA tabloları Telegram dışında log/state/ledger içinde kalır.
- Erken startup Telegram hotfix'i pakete dahildir.
- Trade Engine, giriş/çıkış matematiği, stop/BE ve öğrenme davranışı değiştirilmedi.
