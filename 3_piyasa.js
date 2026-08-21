const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const realExecution = require('./85_st2_real_order_execution.js');

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
    const endpoint = h.binanceEndpoint || { label: 'UNKNOWN', httpFutures: 'YOK' };
    console.log(`🔄 Binance Futures ${endpoint.label} sembol listesi ve kuralları çekiliyor | ${endpoint.httpFutures}`);

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

    // R25.4: Giriş readiness evreni hacim sıralamasındaki çekirdek evrendir.
    // Restartta açık gerçek pozisyon sembolleri koruma için h.state.semboller'e eklenebilir;
    // bu ek koruma sembolleri yeni giriş readiness denominatorünü büyütmemelidir.
    const coreLimit = Math.max(1, Number(ayarlar.taranacakCoinSayisi || 200));
    h.state.st2CoreUniverseSymbols = [...new Set((h.state.semboller || []).map(String).filter(Boolean))].slice(0, coreLimit);
    h.state.st2CoreUniverseSelectedAt = new Date().toISOString();
}


async function acikPozisyonlariHizliDevral() {
    if (ayarlar.sanalEmirModu) return acikPozisyonlariBorsadanDevral();
    const snapshot = await realExecution.startupSafetySnapshot(h.client);
    const aktifler = Array.isArray(snapshot.positions) ? snapshot.positions.filter(pos => pos?.sanal === false) : [];
    h.state.aktifPozisyonlar = aktifler;
    h.state.alinanlar = [...new Set(aktifler.filter(p => String(p?.yon || '').toUpperCase() === 'LONG').map(p => p.sym).filter(Boolean))];
    h.state.aktifShortlar = [...new Set(aktifler.filter(p => String(p?.yon || '').toUpperCase() === 'SHORT').map(p => p.sym).filter(Boolean))];
    h.state.semboller = [...new Set([...(h.state.semboller || []), ...aktifler.map(p => p.sym).filter(Boolean)])];
    const coreSet = new Set((h.state.st2CoreUniverseSymbols || []).map(String));
    h.state.st2ProtectionExtraSymbols = h.state.semboller.filter(sym => !coreSet.has(String(sym)));
    h.state.realOrderStartupBlocked = true;
    h.state.realOrderStartupSafetySnapshot = {
        at: new Date().toISOString(), restored: snapshot.restored || 0, adopted: snapshot.adopted || 0,
        open: aktifler.length, blocked: true
    };
    console.log(`🛡️ [GERÇEK STARTUP SAFETY SNAPSHOT] Açık gerçek ${aktifler.length} | Warmup öncelikli | Full mutabakat READY sonrası`);
    return snapshot;
}


async function acikPozisyonlariGirisIcinDevral() {
    if (ayarlar.sanalEmirModu) return acikPozisyonlariBorsadanDevral();
    try {
        const reconciliation = await realExecution.startupEntryReconcile(h.client);
        const gercekAktifler = Array.isArray(reconciliation.positions) ? reconciliation.positions.filter(pos => pos?.sanal === false) : [];
        reconciliation.positions = gercekAktifler;
        h.state.aktifPozisyonlar = gercekAktifler;
        h.state.alinanlar = [...new Set(gercekAktifler.filter(p => String(p?.yon || '').toUpperCase() === 'LONG').map(p => p.sym).filter(Boolean))];
        h.state.aktifShortlar = [...new Set(gercekAktifler.filter(p => String(p?.yon || '').toUpperCase() === 'SHORT').map(p => p.sym).filter(Boolean))];
        h.state.realOrderStartupReconciliation = {
            at: new Date().toISOString(),
            mode: 'ENTRY_FAST_PATH',
            restored: reconciliation.restored || 0,
            adopted: reconciliation.adopted || 0,
            protectionFailures: reconciliation.protectionFailures || 0,
            closeAccountingPending: reconciliation.closeAccountingPending || 0,
            blocked: Boolean(reconciliation.blocked)
        };
        h.state.realOrderStartupBlocked = Boolean(reconciliation.blocked);
        h.state.semboller = [...new Set([...(h.state.semboller || []), ...gercekAktifler.map(p => p.sym).filter(Boolean)])];
        const coreSet = new Set((h.state.st2CoreUniverseSymbols || []).map(String));
        h.state.st2ProtectionExtraSymbols = h.state.semboller.filter(sym => !coreSet.has(String(sym)));
        console.log(`🔐 [GERÇEK STARTUP ENTRY MUTABAKATI] Gerçek açık ${gercekAktifler.length} | Close accounting pending ${Number(reconciliation.closeAccountingPending || 0)} | Koruma hatası ${Number(reconciliation.protectionFailures || 0)} | REAL ${reconciliation.blocked ? 'FAIL-CLOSED' : 'READY'}`);
        if (reconciliation.blocked) throw new Error(`GERCEK_STARTUP_ENTRY_FAIL_CLOSED:KORUMA_HATASI=${reconciliation.protectionFailures || 0}`);
        return reconciliation;
    } catch (e) {
        h.state.realOrderStartupBlocked = true;
        console.error(`🚨 [GERÇEK STARTUP ENTRY MUTABAKAT FAIL-CLOSED] ${e.message || e}`);
        throw e;
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
        return { positions: aktifler, restored: aktifler.length, adopted: 0, blocked: false };
    }

    try {
        const reconciliation = await realExecution.startupReconcile(h.client);
        const gercekAktifler = Array.isArray(reconciliation.positions) ? reconciliation.positions.filter(pos => pos?.sanal === false) : [];
        const aktifler = gercekAktifler;
        reconciliation.positions = aktifler;
        h.state.aktifPozisyonlar = aktifler;
        h.state.alinanlar = [...new Set(aktifler.filter(p => String(p?.yon || '').toUpperCase() === 'LONG').map(p => p.sym).filter(Boolean))];
        h.state.aktifShortlar = [...new Set(aktifler.filter(p => String(p?.yon || '').toUpperCase() === 'SHORT').map(p => p.sym).filter(Boolean))];
        h.state.realOrderStartupReconciliation = {
            at: new Date().toISOString(),
            restored: reconciliation.restored || 0,
            adopted: reconciliation.adopted || 0,
            protectionFailures: reconciliation.protectionFailures || 0,
            recoveredClosures: Array.isArray(reconciliation.recoveredClosures) ? reconciliation.recoveredClosures.length : 0,
            blocked: Boolean(reconciliation.blocked)
        };
        h.state.realOrderStartupBlocked = Boolean(reconciliation.blocked);

        // Borsada açık gerçek pozisyon, hacim evreninin dışına düşmüş olsa bile fiyat takibinden çıkarılamaz.
        // Ancak R25.4'te bu ek koruma sembolleri startup giriş readiness evrenine dahil edilmez.
        h.state.semboller = [...new Set([...(h.state.semboller || []), ...aktifler.map(p => p.sym).filter(Boolean)])];
        const coreSet = new Set((h.state.st2CoreUniverseSymbols || []).map(String));
        h.state.st2ProtectionExtraSymbols = h.state.semboller.filter(sym => !coreSet.has(String(sym)));

        const recoveredClosures = Array.isArray(reconciliation.recoveredClosures) ? reconciliation.recoveredClosures : [];
        h.state.realOrderRecoveredClosures = recoveredClosures;
        console.log(`🔐 [GERÇEK RESTART MUTABAKATI] Gerçek açık ${gercekAktifler.length} | Kalıcı gerçek ${reconciliation.restored || 0} | Harici/adopted ${reconciliation.adopted || 0} | Restart kapanışı ${recoveredClosures.length} | Koruma hatası ${reconciliation.protectionFailures || 0}`);
        if (recoveredClosures.length > 0) {
            const satirlar = recoveredClosures.slice(0, 10).map(row =>
                `${row.symbol || 'YOK'} | ${row.reason || 'MUTABAKAT'} | Net ${Number(row.netPnl || 0).toFixed(6)} | ${row.accountingExact ? 'KESİN' : 'KISMİ'}`
            );
            const mesaj = [
                '🔄 GERÇEK RESTART KAPANIŞ MUTABAKATI',
                ...satirlar,
                recoveredClosures.length > 10 ? `… +${recoveredClosures.length - 10} kayıt` : '',
                'ℹ️ Restart sırasında kapanmış bu işlemler execution audit/state içine işlendi; otomatik bilimsel öğrenmeye eklenmedi.'
            ].filter(Boolean).join('\n');
            // Kapanış muhasebesi/state commit'i tamamlandıktan sonra Telegram ulaşımı startup'ı
            // bloke edemez. Bildirim kritik kuyrukta arka planda gider; başarısızlık mutabakatı geri almaz.
            setImmediate(() => {
                Promise.resolve(h.telegramMesajGonderKritikTeslim(mesaj, { coalesceKey: 'restart-close-reconciliation' }))
                    .catch(err => console.error(`⚠️ [RESTART KAPANIŞ TELEGRAM] ${err.message}`));
            });
        }
        if (reconciliation.blocked) {
            throw new Error(`GERCEK_RESTART_FAIL_CLOSED:KORUMA_HATASI=${reconciliation.protectionFailures || 0}`);
        }
        return reconciliation;
    } catch (e) {
        h.state.realOrderStartupBlocked = true;
        console.error(`🚨 [GERÇEK POZİSYON DEVİR FAIL-CLOSED] ${e.message || e}`);
        // Gerçek modda API/mutabakat hatasını "pozisyon yok" kabul edip temiz başlamaya çevirmek yasaktır.
        // Başlangıç kesilir; böylece mevcut borsa pozisyonunun üzerine yeni emir açılamaz.
        throw e;
    }
}

module.exports = { sembolleriYukle, acikPozisyonlariHizliDevral, acikPozisyonlariGirisIcinDevral, acikPozisyonlariBorsadanDevral, tickerListesi, hacimSiralamasiCek };
