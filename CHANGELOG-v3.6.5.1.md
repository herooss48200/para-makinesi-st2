# AGROS v3.6.5.1 — Exit Replay Historical Migration

- Eski `exit-replay-results.jsonl` kayıtlarını v3.6.5 DNA Scoreboard şemasına taşır.
- Trade ID bazında tekilleştirir; yinelenen kayıtta son kayıt korunur.
- `sanal-state.json` içindeki `exitReplayOzet` alanını Net, WR, PF, Beat Rate ve DNA sıralamalarıyla yeniden kurar.
- `exit-replay-model.json` dosyasını v3.6.5 şemasında yeniden üretir.
- İşlemden önce state ve model dosyalarının zaman damgalı yedeğini otomatik alır.
- Trade Engine, stop, TP ve açık pozisyonlar değiştirilmez.

## AWS kullanım

Bot durdurulduktan sonra:

```bash
npm run migrate:exit-replay
npm run check
```

Sonuç doğrulandıktan sonra PM2 yeniden başlatılır.
