const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

function sayi(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function tickerListesi(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return Object.entries(raw).map(([symbol, value]) => ({ symbol, ...(value || {}) }));
    return [];
}

async function hacimSiralamasiCek() {
    if (typeof h.client.futuresDailyStats !== 'function') throw new Error('futuresDailyStats kullanılamıyor');
    const raw = await h.client.futuresDailyStats();
    return tickerListesi(raw);
}

function filtreDegeri(filters, tip, anahtar) {
    const f = filters.find(x => x.filterType === tip);
    return f ? parseFloat(f[anahtar]) : null;
}

async function sembolleriYukle() {
    const baslangic = Date.now();
    console.log('🔄 Binance Testnet aktif sembol listesi ve kuralları çekiliyor...');

    try {
        const exchangeInfo = await h.client.futuresExchangeInfo();
        const uygunSemboller = [];
        h.state.basamaklar = {};

        for (const s of exchangeInfo.symbols) {
            if (s.status === 'TRADING' && s.symbol.endsWith('USDT') && s.contractType === 'PERPETUAL') {
                const lotStep = filtreDegeri(s.filters, 'LOT_SIZE', 'stepSize') || Math.pow(10, -s.quantityPrecision);
                const minQty = filtreDegeri(s.filters, 'LOT_SIZE', 'minQty') || lotStep;
                const tickSize = filtreDegeri(s.filters, 'PRICE_FILTER', 'tickSize') || Math.pow(10, -s.pricePrecision);
                const minNotional = filtreDegeri(s.filters, 'MIN_NOTIONAL', 'notional') || filtreDegeri(s.filters, 'NOTIONAL', 'minNotional') || 5;

                uygunSemboller.push(s.symbol);
                h.state.basamaklar[s.symbol] = {
                    pricePrecision: s.pricePrecision,
                    quantityPrecision: s.quantityPrecision,
                    tickSize,
                    stepSize: lotStep,
                    minQty,
                    minNotional
                };
            }
        }

        const limit = Math.max(1, Number(ayarlar.taranacakCoinSayisi || 200));
        const uygunSet = new Set(uygunSemboller);
        let hacimKaydi = [];
        try {
            const tickerlar = await hacimSiralamasiCek();
            hacimKaydi = tickerlar
                .filter(x => uygunSet.has(String(x.symbol || '').toUpperCase()))
                .map(x => ({ symbol: String(x.symbol).toUpperCase(), quoteVolume: sayi(x.quoteVolume) }))
                .sort((a, b) => b.quoteVolume - a.quoteVolume || a.symbol.localeCompare(b.symbol));
            if (!hacimKaydi.length) throw new Error('24s quoteVolume listesi boş');
            h.state.semboller = hacimKaydi.slice(0, limit).map(x => x.symbol);
            h.state.sembolEvreniKaniti = {
                method: 'FUTURES_24H_QUOTE_VOLUME_DESC', count: h.state.semboller.length,
                selectedAt: new Date().toISOString(), top10: hacimKaydi.slice(0, 10),
                boundary: hacimKaydi[Math.min(limit, hacimKaydi.length) - 1] || null,
                requested: limit, eligible: uygunSemboller.length, availableRanked: hacimKaydi.length,
                durationMs: Date.now() - baslangic, status: h.state.semboller.length >= limit ? 'HEALTHY' : 'DEGRADED'
            };
            h.state.sembolVeriSagligi = {
                ...(h.state.sembolVeriSagligi || {}), durum: h.state.sembolEvreniKaniti.status,
                istenen: limit, uygun: uygunSemboller.length, secilen: h.state.semboller.length,
                siraliVeri: hacimKaydi.length, evrenYuklemeMs: Date.now() - baslangic,
                sonGuncelleme: new Date().toISOString(), hata: 0
            };
            const ilk10 = h.state.sembolEvreniKaniti.top10.map(x => `${x.symbol}:${x.quoteVolume.toFixed(0)}`).join(' | ');
            const son = h.state.sembolEvreniKaniti.boundary;
            console.log(`✅ ${h.state.semboller.length} adet USDT PERPETUAL, 24s quoteVolume sırasına göre yüklendi.`);
            console.log(`📊 [CANLI EVREN KANITI] TOP10 ${ilk10}`);
            console.log(`📊 [CANLI EVREN SINIRI] #${h.state.semboller.length} ${son?.symbol || 'YOK'} | quoteVolume ${sayi(son?.quoteVolume).toFixed(0)}`);
        } catch (hacimHatasi) {
            // Güvenli geri dönüş: canlılığı kesmez; fakat sıralamanın kanıtlanamadığını açıkça işaretler.
            h.state.semboller = uygunSemboller.slice(0, limit);
            h.state.sembolEvreniKaniti = { method: 'EXCHANGE_INFO_FALLBACK_UNSORTED', count: h.state.semboller.length, selectedAt: new Date().toISOString(), error: hacimHatasi.message, top10: [], boundary: null, requested: limit, eligible: uygunSemboller.length, durationMs: Date.now() - baslangic, status: 'DEGRADED' };
            h.state.sembolVeriSagligi = { ...(h.state.sembolVeriSagligi || {}), durum: 'DEGRADED', istenen: limit, uygun: uygunSemboller.length, secilen: h.state.semboller.length, siraliVeri: 0, evrenYuklemeMs: Date.now() - baslangic, sonGuncelleme: new Date().toISOString(), hata: 1, sonHata: hacimHatasi.message };
            console.error(`⚠️ [CANLI EVREN] 24s hacim sıralaması alınamadı; exchangeInfo fallback kullanıldı: ${hacimHatasi.message}`);
        }
    } catch (e) {
        console.error('❌ Sembol yükleme hatası:', e.message || e);
        h.state.semboller = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
        h.state.sembolEvreniKaniti = { method: 'EMERGENCY_FALLBACK', count: h.state.semboller.length, selectedAt: new Date().toISOString(), error: e.message || String(e), requested: Number(ayarlar.taranacakCoinSayisi || 200), durationMs: Date.now() - baslangic, status: 'CRITICAL' };
        h.state.sembolVeriSagligi = { ...(h.state.sembolVeriSagligi || {}), durum: 'CRITICAL', istenen: Number(ayarlar.taranacakCoinSayisi || 200), secilen: h.state.semboller.length, evrenYuklemeMs: Date.now() - baslangic, sonGuncelleme: new Date().toISOString(), hata: 1, sonHata: e.message || String(e) };
        h.state.basamaklar = {
            BTCUSDT: { pricePrecision: 2, quantityPrecision: 3, tickSize: 0.1, stepSize: 0.001, minQty: 0.001, minNotional: 5 },
            ETHUSDT: { pricePrecision: 2, quantityPrecision: 3, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, minNotional: 5 },
            BNBUSDT: { pricePrecision: 2, quantityPrecision: 2, tickSize: 0.01, stepSize: 0.01, minQty: 0.01, minNotional: 5 },
            SOLUSDT: { pricePrecision: 3, quantityPrecision: 2, tickSize: 0.001, stepSize: 0.01, minQty: 0.01, minNotional: 5 },
            XRPUSDT: { pricePrecision: 4, quantityPrecision: 1, tickSize: 0.0001, stepSize: 0.1, minQty: 0.1, minNotional: 5 }
        };
    }
}

async function acikPozisyonlariBorsadanDevral() {
    if (ayarlar.sanalEmirModu) {
        const aktifler = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar : [];
        // Sanal modda Binance pozisyonu devralınmaz; kalıcı hafızadan yüklenen sanal işlemler korunur.
        h.state.aktifPozisyonlar = aktifler;
        h.state.alinanlar = [...new Set(aktifler.filter(p => String(p?.yon || '').toUpperCase() === 'LONG').map(p => p.sym).filter(Boolean))];
        h.state.aktifShortlar = [...new Set(aktifler.filter(p => String(p?.yon || '').toUpperCase() === 'SHORT').map(p => p.sym).filter(Boolean))];
        console.log(`🧪 Sanal emir modu aktif: Binance pozisyonu devralınmayacak; ${aktifler.length} kalıcı sanal pozisyon korunuyor.`);
        return;
    }

    try {
        const hesap = await h.client.futuresPositionRisk();
        h.state.aktifPozisyonlar = [];
        h.state.alinanlar = [];
        h.state.aktifShortlar = [];

        const acikPozisyonlar = hesap.filter(p => parseFloat(p.positionAmt) !== 0);

        for (const pos of acikPozisyonlar) {
            const sym = pos.symbol;
            if (!h.state.semboller.includes(sym)) continue;

            const miktar = parseFloat(pos.positionAmt);
            const giris = parseFloat(pos.entryPrice);
            const yon = miktar > 0 ? 'LONG' : 'SHORT';
            const slOrani = (ayarlar.sabitStopYuzdesi || 1.5) / 100;
            const tpOrani = (ayarlar.sabitTpYuzdesi || 0.4) / 100;
            const sl = yon === 'LONG' ? giris * (1 - slOrani) : giris * (1 + slOrani);
            const tp = yon === 'LONG' ? giris * (1 + tpOrani) : giris * (1 - tpOrani);

            h.state.aktifPozisyonlar.push({
                sym,
                yon,
                girisFiyati: giris,
                sl,
                tp,
                mevcutTpYuzdesi: ayarlar.sabitTpYuzdesi || 0.4,
                tpKademe: 1,
                sonTpSeviyesi: tp,
                breakevenAktif: false
            });

            if (yon === 'LONG') h.state.alinanlar.push(sym);
            else h.state.aktifShortlar.push(sym);
        }

        console.log(`📡 ${h.state.aktifPozisyonlar.length} açık pozisyon devralındı.`);
    } catch (e) {
        console.log('ℹ️ Pozisyon devralma pasif. Bot sıfırdan ve temiz hafızayla başlıyor.');
        h.state.aktifPozisyonlar = [];
        h.state.alinanlar = [];
        h.state.aktifShortlar = [];
    }
}

module.exports = { sembolleriYukle, acikPozisyonlariBorsadanDevral, tickerListesi, hacimSiralamasiCek };
