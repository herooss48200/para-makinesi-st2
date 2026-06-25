const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

function filtreDegeri(filters, tip, anahtar) {
    const f = filters.find(x => x.filterType === tip);
    return f ? parseFloat(f[anahtar]) : null;
}

async function sembolleriYukle() {
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

        h.state.semboller = uygunSemboller.slice(0, ayarlar.taranacakCoinSayisi || 100);
        console.log(`✅ ${h.state.semboller.length} adet geçerli FUTURES sembolü kurallarıyla yüklendi.`);
    } catch (e) {
        console.error('❌ Sembol yükleme hatası:', e.message || e);
        h.state.semboller = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
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
        console.log('🧪 Sanal emir modu aktif: borsadan açık pozisyon devralınmayacak.');
        h.state.aktifPozisyonlar = [];
        h.state.alinanlar = [];
        h.state.aktifShortlar = [];
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

module.exports = { sembolleriYukle, acikPozisyonlariBorsadanDevral };
