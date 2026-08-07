# AGROS ST2 v6.13.5-R2 — Economy Floor + Success-First Confirmed + Real Size

- Erken ekonomi tabanı: MFE +%0.25 görüldüğünde brüt +%0.20 taban; minimum net hedef +%0.10.
- Renko takeover +%0.60 ve pozisyona dondurulmuş öğrenilmiş trail korunur.
- CONFIRMED seçim hedefi değiştirildi: ana amaç daha yüksek başarı oranı / yanlış giriş eleme.
- CONFIRMED için minimum Full Lifecycle N15 + WR %75 + PF>1 + expectancy>0 + net>0.
- DIRECT'e karşı skor/net üstünlüğü zorunluluğu kaldırıldı.
- Exact-pattern teyit profili N15 altında ise olgun direction fallback kanıtı artık bloke edilmez.
- CONFIRMED offset seçimi önce WR, sonra örnek sayısı ve pozitif ekonomi ile sıralanır.
- Gerçek quantity stepSize üzerinde hedef notional'a en yakın geçerli adımı seçer; SOL benzeri floor-quantization fail-closed kaybını önler.
- Mevcut slot, minQty, minNotional ve notional sapma fail-closed kontrolleri korunur.
