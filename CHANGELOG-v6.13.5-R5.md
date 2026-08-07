# AGROS ST2 v6.13.5-R5 — MARKET DATA FAST REFRESH

Tarih: 07.08.2026

## Amaç
Golden Renko başlangıcında ve canlı market-data tazelemesinde görülen uzun beklemeyi kaldırmak; 15m mum ve 1m Renko veri hattını bounded/fail-fast hale getirmek; ST1 shadow işini core giriş verisinden ayırmak; Telegram'daki 1m veri sayacını gerçeğe uygun göstermek.

## Canlı kanıtla bulunan kök nedenler
- Golden Renko başlangıcı 202 sembolde 1.765.230 ms (~29 dk 25 sn) sürüyordu.
- 15m ve SuperTrend turları tam tarihçeyi tekrar tekrar indiriyordu.
- LOW-priority market-data istekleri request timeout başlamadan önce ağ kuyruğunda süresiz bekleyebiliyordu.
- 15m ve SuperTrend bulk turları aynı ağ kuyruğunda üst üste binebiliyordu.
- ST1 3m shadow ilerlemesi `superTrendHazir` alanını ezerek Telegram'da core 1m verisini 47/200 gibi yanlış gösterebiliyordu.

## Değişiklikler
- Startup: kontrollü 10 ağ eşzamanlılığı / 20 worker, 8 sn request timeout, ilk tur retry=0, 30 sn queue watchdog; yalnız eksik semboller için tek repair turu.
- Warm cache: 15m ve 1m tazelemede tam 250/80 geçmiş yerine son 3 mum alınır ve mevcut cache ile openTime bazında birleştirilir.
- Bulk market-data turları tek kilit kullanır; 15m ile 1m/ST1 aynı anda kuyruğu doldurmaz.
- Network queue watchdog: kuyrukta başlamadan bekleyen istek `EQUEUEWAIT` ile bounded fail-fast olur; sonraki tur mevcut cache'i koruyarak yeniden dener.
- Core 1m Renko refresh 15 sn hattında ST1 shadow taşımaz; ST1 shadow ayrı ve seyrek zamanlanır.
- Refresh batch deadline: 15m 120 sn, core 1m 55 sn; tur sonsuza kadar `çalışıyor` kalmaz.
- Telegram veri satırı artık `1m Veri` ile `Renko ST hesap` / `Yetersiz` sayılarını ayrı gösterir.
- Renko scan health hesaplanabilir 1m Renko ST sayısını rapor katmanına yayınlar.

## Değişmeyenler
- Entry Evolution fiyat matematiği ve pusu şartları değişmedi.
- Premier/Score seçimi ve gerçek giriş yetkisi değişmedi.
- K0.5/K1/K2/K3 stop ve Renko ekonomi yönetimi değişmedi.
- Gerçek emir boyutlandırma/restart koruması değişmedi.
- Williams %R hâlâ shadow-only; gerçek emre etkisi yok.
