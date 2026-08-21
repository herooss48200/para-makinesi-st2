'use strict';

// AGROS ST2 R26 CORE-ONLY POSITION RUNTIME
// Canlı runtime otoritesi yalnız:
// 1) Binance gerçek pozisyon mutabakatı
// 2) tek yüzdesel stop ekonomisi
// 3) atomik stop replacement
// Eski deney/replay/exit yaşamları bu dosyadan fiziksel olarak çıkarılmıştır.

const h = require('./1_hafiza.js');
const m = require('./motor.js');
const ayarlar = require('./ayarlar.js');
const rapor = require('./2_rapor.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');
const n5Economy = require('./62_n5_premier_economy.js');
const entryEvolution = require('./73_st2_renko_entry_evolution.js');
const confirmedEvidence = require('./94_st2_15m_confirmed_evidence.js');
const realExecution = require('./85_st2_real_order_execution.js');
const closeLifecycle = require('./86_st2_close_lifecycle.js');

function pozisyonListelerindenSil(pos) {
    if (pos.yon === 'LONG') h.state.alinanlar = (h.state.alinanlar || []).filter(x => x !== pos.sym);
    else h.state.aktifShortlar = (h.state.aktifShortlar || []).filter(x => x !== pos.sym);
}

function renkoPozisyonMu(pos) {
    const raw = String(pos?.strategyLane || pos?.entryStrategy || pos?.girisAnalizi?.strategyLane || pos?.girisAnalizi?.entryStrategy || '').trim().toUpperCase();
    return !raw || raw === 'RENKO' || raw === 'ST2_RENKO';
}

function trtZaman(ts) {
    const t = typeof ts === 'number' ? ts : Date.parse(String(ts || ''));
    if (!Number.isFinite(t) || t <= 0) return 'YOK';
    return new Date(t).toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul', hour12: false,
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}
function sureMetni(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}sa ${m}dk ${s}sn` : `${m}dk ${s}sn`;
}

function yuzdelikKarHesapla(pos, canliFiyat) {
    const giris = Number(pos?.girisFiyati || 0);
    const fiyat = Number(canliFiyat || 0);
    if (!(giris > 0) || !(fiyat > 0)) return 0;
    return pos.yon === 'LONG'
        ? ((fiyat - giris) / giris) * 100
        : ((giris - fiyat) / giris) * 100;
}

function yuzdeselEkonomiHesapla(pos, canliFiyat) {
    if (ayarlar.confirmedYuzdeselEkonomiAktif !== true) return false;
    const giris = Number(pos?.girisFiyati || 0);
    const fiyat = Number(canliFiyat || 0);
    if (!(giris > 0) || !(fiyat > 0)) return false;

    const karYuzde = yuzdelikKarHesapla(pos, fiyat);
    const aktivasyon = Number(ayarlar.confirmedYuzdeselEkonomiAktivasyonYuzde || 1.50);
    if (karYuzde + 1e-9 < aktivasyon) return false;

    const ilkKilit = Number(ayarlar.confirmedYuzdeselEkonomiIlkKilitYuzde || 1.00);
    const takipMesafe = Math.max(0, Number(ayarlar.confirmedYuzdeselEkonomiTakipMesafeYuzde ?? 0.50));
    const adim = Math.max(0.05, Number(ayarlar.confirmedYuzdeselEkonomiAdimYuzde || 0.50));
    const kademe = Math.max(0, Math.floor((karYuzde - aktivasyon + 1e-9) / adim));
    const kademeTepeKar = aktivasyon + kademe * adim;
    const korunanKar = Math.max(ilkKilit, kademeTepeKar - takipMesafe);
    const adaySl = pos.yon === 'LONG'
        ? giris * (1 + korunanKar / 100)
        : giris * (1 - korunanKar / 100);
    const mevcutSl = Number(pos.sl || 0);
    const dahaIyi = pos.yon === 'LONG' ? adaySl > mevcutSl : adaySl < mevcutSl;
    if (!dahaIyi) return false;

    pos.sl = adaySl;
    pos.breakevenAktif = true;
    pos.breakevenYeniAktif = true;
    pos.yuzdeselEkonomiAktif = true;
    pos.yuzdeselEkonomiSonKarYuzde = karYuzde;
    pos.yuzdeselEkonomiKorunanKarYuzde = korunanKar;
    pos.renkoExitLastStopSourceLabel = 'Yüzdesel ekonomi takip stopu';
    return true;
}

function stopBildirimGerekli(pos, oncekiSl, yeniSl) {
    if (!ayarlar.telegramStopGuncellemeMesaji) return false;
    if (!oncekiSl || !yeniSl || oncekiSl === yeniSl) return false;
    const now = Date.now();
    const minSure = Math.max(5, Number(ayarlar.stopBildirimMinSaniye || 60)) * 1000;
    if (pos.breakevenYeniAktif) return true;
    return !pos.sonStopBildirimZamani || now - Number(pos.sonStopBildirimZamani || 0) >= minSure;
}

async function stopGuncellemeMesajiGonder(pos, oncekiSl, yeniSl, canliFiyat) {
    const pPrecision = h.state.basamaklar[pos.sym]?.pricePrecision ?? 4;
    const karYuzde = yuzdelikKarHesapla(pos, canliFiyat);
    const korunanKarYuzde = pos.yon === 'LONG'
        ? ((yeniSl - pos.girisFiyati) / pos.girisFiyati) * 100
        : ((pos.girisFiyati - yeniSl) / pos.girisFiyati) * 100;
    await h.telegramMesajGonder(
        `<b>🔄 STOP GÜNCELLENDİ</b>\n\n` +
        `🔀 ${pos.sym} (${pos.yon})\n` +
        `📍 Anlık Fiyat: ${Number(canliFiyat).toFixed(pPrecision)}\n` +
        `🛡️ Eski SL: ${Number(oncekiSl).toFixed(pPrecision)}\n` +
        `🛡️ Yeni SL: ${Number(yeniSl).toFixed(pPrecision)}\n` +
        `📈 Anlık Kâr: %${karYuzde.toFixed(2)}\n` +
        `🔒 Korunan Kâr: %${korunanKarYuzde.toFixed(2)}`
    );
    pos.sonStopBildirimZamani = Date.now();
}

function guvenliStopUygula(pos, oncekiSl, adaySl) {
    const onceki = Number(oncekiSl);
    const aday = Number(adaySl);
    if (!Number.isFinite(onceki) || onceki <= 0) return { applied: false, reason: 'ONCEKI_STOP_GECERSIZ', value: onceki };
    if (!Number.isFinite(aday) || aday <= 0) return { applied: false, reason: 'ADAY_STOP_GECERSIZ', value: onceki };
    const klipli = m.fiyatKlip(pos.sym, aday);
    if (!Number.isFinite(klipli) || klipli <= 0) return { applied: false, reason: 'KLIP_SONRASI_STOP_GECERSIZ', value: onceki };
    const tick = Number(h.state.basamaklar[pos.sym]?.tickSize) || Math.pow(10, -(h.state.basamaklar[pos.sym]?.pricePrecision ?? 8));
    const epsilon = Math.max(Number.EPSILON, tick / 2);
    const iyilesiyor = pos.yon === 'LONG' ? klipli > onceki + epsilon : klipli < onceki - epsilon;
    if (!iyilesiyor) return { applied: false, reason: Math.abs(klipli - onceki) <= epsilon ? 'NO_OP' : 'MONOTON_STOP_KORUMASI', value: onceki };
    pos.sl = klipli;
    return { applied: true, reason: 'APPLIED', value: klipli };
}

function gercekOkumaDeadline(promise, timeoutMs, label = 'SIGNED_READ_TIMEOUT') {
    const ms = Math.max(5000, Number(timeoutMs || 20000));
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label}:${ms}ms`)), ms);
            timer.unref?.();
        })
    ]).finally(() => clearTimeout(timer));
}

// R31.4: positionRisk signed-read single-flight + hard-stale rotation.
// Normal timeout alttaki HTTP istegini iptal etmeyebilir. Ayni hung promise sonsuza kadar
// yeniden kullanilirsa mutabakat kalici STALE olur. En fazla belirlenen yas boyunca ayni
// istegi paylas; bundan eski task'i abandoned sayip yalniz bir yeni probe ac.
let positionRiskSingleFlight = null;
let positionRiskSingleFlightSeq = 0;
function positionRiskSingleFlightRead(client = h.client) {
    const now = Date.now();
    const maxAgeMs = Math.max(30000, Number(ayarlar.gercekPozisyonMutabakatSingleFlightMaxAgeMs || 60000));
    if (positionRiskSingleFlight) {
        const ageMs = now - Number(positionRiskSingleFlight.startedAt || now);
        const clientChanged = positionRiskSingleFlight.client !== client;
        if (clientChanged || ageMs > maxAgeMs) {
            h.state.st2PositionRiskRead ||= {};
            h.state.st2PositionRiskRead.abandoned = Number(h.state.st2PositionRiskRead.abandoned || 0) + 1;
            h.state.st2PositionRiskRead.lastAbandonedAt = now;
            h.state.st2PositionRiskRead.lastAbandonedAgeMs = ageMs;
            positionRiskSingleFlight = null;
        }
    }
    if (!positionRiskSingleFlight) {
        const startedAt = Date.now();
        const id = ++positionRiskSingleFlightSeq;
        const promise = Promise.resolve().then(() => client.futuresPositionRisk());
        const task = { promise, startedAt, client, id };
        positionRiskSingleFlight = task;
        promise.then(
            () => { if (positionRiskSingleFlight === task) positionRiskSingleFlight = null; },
            () => { if (positionRiskSingleFlight === task) positionRiskSingleFlight = null; }
        );
    }
    h.state.st2PositionRiskRead ||= {};
    h.state.st2PositionRiskRead.inFlight = true;
    h.state.st2PositionRiskRead.flightId = positionRiskSingleFlight.id;
    h.state.st2PositionRiskRead.startedAt = positionRiskSingleFlight.startedAt;
    h.state.st2PositionRiskRead.ageMs = Date.now() - positionRiskSingleFlight.startedAt;
    return positionRiskSingleFlight.promise;
}

function exchangeYon(row) {
    const amt = Number(row?.positionAmt || 0);
    return amt > 0 ? 'LONG' : (amt < 0 ? 'SHORT' : null);
}

async function exchangePositionSnapshot(client = h.client) {
    try {
        const rows = await gercekOkumaDeadline(
            positionRiskSingleFlightRead(client),
            ayarlar.gercekPozisyonMutabakatTimeoutMs || 20000,
            'FUTURES_POSITION_RISK_TIMEOUT'
        );
        const all = Array.isArray(rows) ? rows : [];
        const exchangeActive = all.filter(row => Math.abs(Number(row?.positionAmt || 0)) > 0);
        const localActive = (h.state.aktifPozisyonlar || []).filter(pos => pos?.sanal === false);
        const localBySymbol = new Map(localActive.map(pos => [String(pos?.sym || '').toUpperCase(), pos]));
        const unknown = [];
        const sideMismatch = [];
        for (const row of exchangeActive) {
            const symbol = String(row?.symbol || '').toUpperCase();
            const local = localBySymbol.get(symbol);
            if (!local) { unknown.push(symbol); continue; }
            const exSide = exchangeYon(row);
            const localSide = String(local?.yon || '').toUpperCase();
            if (exSide && localSide && exSide !== localSide) sideMismatch.push(`${symbol}:${localSide}->${exSide}`);
        }
        const now = Date.now();
        const safe = unknown.length === 0 && sideMismatch.length === 0;
        h.state.st2PositionRiskRead = {
            ...(h.state.st2PositionRiskRead || {}),
            inFlight: Boolean(positionRiskSingleFlight),
            lastOkAt: now,
            snapshotVerifiedAt: safe ? now : Number(h.state.st2PositionRiskRead?.snapshotVerifiedAt || 0),
            snapshotSafe: safe,
            exchangeActiveCount: exchangeActive.length,
            localActiveCount: localActive.length,
            unknownSymbols: unknown,
            sideMismatch,
            lastError: safe ? null : (unknown.length ? `EXCHANGE_UNTRACKED_POSITION:${unknown.join(',')}` : `EXCHANGE_SIDE_MISMATCH:${sideMismatch.join(',')}`)
        };
        if (!safe) {
            return { exchangeOk: false, error: h.state.st2PositionRiskRead.lastError, positions: all, exchangeActive, unknown, sideMismatch };
        }
        return { exchangeOk: true, positions: all, exchangeActive, unknown: [], sideMismatch: [] };
    } catch (e) {
        h.state.st2PositionRiskRead = {
            ...(h.state.st2PositionRiskRead || {}),
            inFlight: Boolean(positionRiskSingleFlight),
            ageMs: positionRiskSingleFlight ? Date.now() - positionRiskSingleFlight.startedAt : 0,
            snapshotSafe: false,
            lastErrorAt: Date.now(),
            lastError: String(e?.message || e)
        };
        console.error(`❌ [GERÇEK POZİSYON SNAPSHOT] ${e.message} | single-flight ${positionRiskSingleFlight ? 'KORUNUYOR' : 'BOSTA'}`);
        return { exchangeOk: false, error: String(e?.message || e), positions: [] };
    }
}

async function minimalKapanisRaporu(pos, closePrice, reason) {
    const exec = pos?.realizedExecution || {};
    const net = Number(exec.netPnl || 0);
    const entry = Number(pos?.girisFiyati || 0);
    const exit = Number(closePrice || exec.exitPrice || 0);
    const openedAt = Number(pos?.acilisZamani || Date.now());
    const closedAtParsed = Date.parse(String(exec?.closedAt || ''));
    const closedAt = Number.isFinite(closedAtParsed) ? closedAtParsed : Date.now();
    const sureMs = Math.max(0, closedAt - openedAt);
    const icon = net > 1e-9 ? '✅' : (net < -1e-9 ? '❌' : '⚖️');
    const sonuc = net > 1e-9 ? 'KÂRLI' : (net < -1e-9 ? 'ZARARLI' : 'NÖTR');
    const tf = String(pos?.sourceTimeframe || pos?.girisAnalizi?.sourceTimeframe || pos?.girisAnalizi?.pusuPeriyodu || '15m');
    const closeFingerprint = String(pos?.realExecutionFingerprint || pos?.gercekEmirYurutme?.fingerprint || `${pos.sym}-${pos.yon}`);
    const telegramCloseResults = await h.telegramMesajGonderKritikTeslim(
        `<b>${icon} GERÇEK POZİSYON KAPANDI</b>\n\n` +
        `🔀 ${pos.sym} ${pos.yon} | ${renkoPozisyonMu(pos) ? '🧱 RENKO REAL' : '⚠️ ESKİ STRATEJİ REAL'} | ⏱️ ${tf}\n` +
        `🎨 Sonuç: ${icon} ${sonuc}\n` +
        `🕒 Giriş: ${trtZaman(openedAt)} TRT\n` +
        `🕒 Çıkış: ${trtZaman(closedAt)} TRT\n` +
        `⌛ Süre: ${sureMetni(sureMs)}\n` +
        `Giriş ${entry} → Çıkış ${exit}\n` +
        `Net ${net >= 0 ? '+' : ''}${net.toFixed(4)} USDT\n` +
        `Sebep: ${reason || exec.reason || 'EXCHANGE_POSITION_CLOSED'}`,
        { coalesceKey: `real-close:${closeFingerprint}:${closedAt}` }
    );
    const telegramCloseOk = Array.isArray(telegramCloseResults) && telegramCloseResults.length > 0 && telegramCloseResults.every(x => x?.sonuc?.ok === true || x?.sonuc?.ambiguousDelivery === true);
    console.log(`${telegramCloseOk ? '✅' : '⚠️'} [GERÇEK KAPANIŞ TELEGRAM] ${pos.sym} ${pos.yon} | ${telegramCloseOk ? 'TESLİM' : 'TESLİM DOĞRULANAMADI'}`);
    if (!telegramCloseOk) throw new Error('GERCEK_KAPANIS_TELEGRAM_TESLIM_DOGRULANAMADI');
}

async function izSurmeyiGuncelle(options = {}) {
    const reconcileOnly = options.reconcileOnly === true;
    const skipExchangeReconcile = options.skipExchangeReconcile === true;
    const providedExchangeSnapshot = Array.isArray(options.exchangeSnapshot) ? options.exchangeSnapshot : null;
    const aktif = h.state.aktifPozisyonlar || [];
    if (aktif.length === 0) return { exchangeOk: true, reconciled: 0, closed: 0, failures: 0 };

    // R26 CORE ONLY: aktif runtime'da Shadow/GAP/sanal pozisyon yaşamaz.
    for (let i = aktif.length - 1; i >= 0; i--) {
        if (aktif[i]?.sanal !== false) aktif.splice(i, 1);
    }
    if (aktif.length === 0) return { exchangeOk: true, reconciled: 0, closed: 0, failures: 0 };

    let borsaPozisyonlar = [];
    if (!skipExchangeReconcile) {
        if (providedExchangeSnapshot) {
            borsaPozisyonlar = providedExchangeSnapshot;
        } else {
            const snapshot = await exchangePositionSnapshot(h.client);
            if (snapshot?.exchangeOk !== true) {
                return { exchangeOk: false, error: snapshot?.error || 'EXCHANGE_POSITION_SNAPSHOT_FAILED', reconciled: 0, closed: 0, failures: 1 };
            }
            borsaPozisyonlar = snapshot.positions || [];
        }
    }

    let reconciledCount = 0;
    let closedCount = 0;
    let reconcileFailures = 0;

    for (let i = aktif.length - 1; i >= 0; i--) {
        const pos = aktif[i];
        if (skipExchangeReconcile && pos?.kapanisIsleniyor) continue;

        if (!skipExchangeReconcile) {
            const borsaPoz = borsaPozisyonlar.find(p => p.symbol === pos.sym);
            const borsaMiktar = borsaPoz ? Math.abs(Number(borsaPoz.positionAmt || 0)) : 0;
            reconciledCount++;
            if (borsaMiktar === 0) {
                if (pos.kapanisIsleniyor) continue;
                pos.kapanisIsleniyor = true;
                let committed = false;
                try {
                    const fallbackPrice = Number(h.state.canliFiyatlar[pos.sym] || pos.girisFiyati || 0);
                    const mutabakat = await realExecution.finalizeExchangeClose(pos, fallbackPrice, h.client, { fastReconcile: true });
                    const commit = closeLifecycle.commitRealClose({
                        state: h.state,
                        pos,
                        indexHint: i,
                        reconciliation: mutabakat,
                        livePrice: Number(mutabakat.exitPrice || fallbackPrice || pos.girisFiyati || 0),
                        manualLockMs: Number(ayarlar.manuelKapanisYenidenGirisKilidiMs || 3600000),
                        removeAuxiliary: pozisyonListelerindenSil,
                        persist: kaliciHafiza.kaydet
                    });
                    committed = commit.ok === true;
                    if (committed) {
                        closedCount++;
                        if (commit.manual !== true && renkoPozisyonMu(pos)) {
                            const sourceTf = String(pos?.sourceTimeframe || pos?.girisAnalizi?.sourceTimeframe || pos?.girisAnalizi?.pusuPeriyodu || '15m').toLowerCase();
                            // R31: 30m/1h/2h/4h GERCEK emirlerdir; ancak kanitlanmis 15m Premier/N5
                            // ogrenme havuzunu birbirine karistirmamak icin ilk fazda yalniz ayri TF sayacina yazilir.
                            if (sourceTf === '15m') {
                                try { n5Economy.close(pos, { net: Number(mutabakat.netPnl || 0), commission: Number(mutabakat.commission || 0), outcome: Number(mutabakat.netPnl || 0) > 0 ? 'TP' : (Number(mutabakat.netPnl || 0) < 0 ? 'SL' : 'BE'), reason: commit.reason }); }
                                catch (err) { console.warn(`⚠️ [N5 CLOSE LEARN] ${pos.sym} ${pos.yon} | ${err.message}`); }
                                try { entryEvolution.close(pos, { exitPrice: Number(commit.closePrice || mutabakat.exitPrice || 0), net: Number(mutabakat.netPnl || 0), commission: Number(mutabakat.commission || 0), reason: commit.reason, closedAt: Date.now() }); }
                                catch (err) { console.warn(`⚠️ [ENTRY EVOLUTION CLOSE LEARN] ${pos.sym} ${pos.yon} | ${err.message}`); }
                                try {
                                    const entry = Number(pos.girisFiyati || 0);
                                    const exit = Number(commit.closePrice || mutabakat.exitPrice || 0);
                                    const netPct = entry > 0 && exit > 0
                                        ? (pos.yon === 'LONG' ? ((exit-entry)/entry)*100 : ((entry-exit)/entry)*100)
                                        : 0;
                                    confirmedEvidence.recordLiveClose(pos, { netPct, at: new Date().toISOString(), closedAt: Date.now() });
                                } catch (err) { console.warn(`⚠️ [ENTRY MODE CLOSE LEARN] ${pos.sym} ${pos.yon} | ${err.message}`); }
                            } else {
                                console.log(`📊 [MTF LIVE CLOSE] ${sourceTf} ${pos.sym} ${pos.yon} | Net ${Number(mutabakat.netPnl || 0).toFixed(4)} | Ayrı TF sayaç; 15m öğrenme havuzu değişmedi`);
                            }
                        }
                    }
                    console.log(`🔎 [GERÇEK KAPANIŞ MUTABAKATI] ${pos.sym} ${pos.yon} | ${commit.reason} | Fill ${commit.closePrice || fallbackPrice} | Net ${Number(mutabakat.netPnl || 0).toFixed(6)} | Slot SERBEST`);
                    closeLifecycle.scheduleCloseReport({
                        pos,
                        closePrice: commit.closePrice || fallbackPrice,
                        reason: commit.reason,
                        reportClose: minimalKapanisRaporu,
                        sendPanel: rapor.raporGonder,
                        persist: kaliciHafiza.kaydet
                    });
                } catch (err) {
                    if (!committed) pos.kapanisIsleniyor = false;
                    reconcileFailures++;
                    console.error(`❌ [GERÇEK KAPANIŞ UZLAŞTIRMA] ${pos.sym} ${pos.yon} | ${err.message}`);
                }
                continue;
            }
        }

        if (reconcileOnly) continue;
        const canliFiyat = Number(h.state.canliFiyatlar[pos.sym] || 0);
        if (!(canliFiyat > 0)) continue;
        const pPrecision = h.state.basamaklar[pos.sym]?.pricePrecision ?? 4;

        // Önceki atomik stop güncellemesi bekliyorsa aynı adayı yeniden dene.
        if (Number(pos.pendingRealStopPrice) > 0) {
            const pendingStop = Number(pos.pendingRealStopPrice);
            const retry = await realExecution.replaceStopAtomic(pos, pendingStop, h.client);
            if (!retry.ok) {
                const now = Date.now();
                const signature = `${retry.reason}|${pendingStop}`;
                if (pos.realStopRetryLastLogSignature !== signature || now - Number(pos.realStopRetryLastLogAt || 0) >= 60_000) {
                    console.warn(`⏳ [GERÇEK STOP YENİDEN DENEME] ${pos.sym} ${pos.yon} | ${retry.reason}`);
                    pos.realStopRetryLastLogSignature = signature;
                    pos.realStopRetryLastLogAt = now;
                }
                if (pos.realStopRetryLastPersistSignature !== signature || now - Number(pos.realStopRetryLastPersistAt || 0) >= 60_000) {
                    pos.realStopRetryLastPersistSignature = signature;
                    pos.realStopRetryLastPersistAt = now;
                    realExecution.persistPosition(pos, 'REAL_STOP_RETRY_PENDING');
                }
                continue;
            }
            pos.sl = pendingStop;
            delete pos.pendingRealStopPrice;
            realExecution.persistPosition(pos, 'REAL_STOP_RETRY_SUCCEEDED');
            console.log(`✅ [GERÇEK STOP YENİDEN DENEME BAŞARILI] ${pos.sym} ${pos.yon} | ${pendingStop.toFixed(pPrecision)}`);
        }

        const oncekiSl = Number(pos.sl);
        const guncellendi = yuzdeselEkonomiHesapla(pos, canliFiyat);
        if (guncellendi) {
            const adaySl = Number(pos.sl);
            pos.sl = oncekiSl;
            const safety = guvenliStopUygula(pos, oncekiSl, adaySl);
            if (!safety.applied) continue;

            const yeniSl = Number(pos.sl);
            const replacement = await realExecution.replaceStopAtomic(pos, yeniSl, h.client);
            if (!replacement.ok) {
                pos.sl = oncekiSl;
                pos.pendingRealStopPrice = yeniSl;
                realExecution.persistPosition(pos, 'REAL_STOP_RETRY_SCHEDULED');
                console.warn(`⚠️ [ATOMİK STOP GÜNCELLEME BEKLEME] ${pos.sym} | ${replacement.reason}`);
                continue;
            }

            delete pos.pendingRealStopPrice;
            console.log(`🔐 [GERÇEK STOP ATOMİK GÜNCELLENDİ] ${pos.sym} ${pos.yon} | ${oncekiSl.toFixed(pPrecision)} → ${yeniSl.toFixed(pPrecision)}`);
            if (stopBildirimGerekli(pos, oncekiSl, yeniSl)) {
                await stopGuncellemeMesajiGonder(pos, oncekiSl, yeniSl, canliFiyat);
                await rapor.raporGonder(true);
            }
            pos.breakevenYeniAktif = false;
            realExecution.persistPosition(pos, 'REAL_STOP_UPDATED_ATOMIC');
        } else {
            // Eski sürüm her saniye her pozisyonu diske yazıyordu. R26 yalnız 60 sn sağlık damgası yazar.
            const now = Date.now();
            if (now - Number(pos.coreLastHeartbeatPersistAt || 0) >= 60_000) {
                pos.coreLastHeartbeatPersistAt = now;
                realExecution.persistPosition(pos, 'REAL_POSITION_CORE_HEARTBEAT');
            }
        }
    }

    return {
        exchangeOk: reconcileFailures === 0,
        reconciled: reconciledCount,
        closed: closedCount,
        failures: reconcileFailures,
        error: reconcileFailures ? 'EXCHANGE_CLOSE_RECONCILIATION_FAILED' : null
    };
}

module.exports = {
    izSurmeyiGuncelle,
    exchangePositionSnapshot,
    _yuzdeselEkonomiHesapla: yuzdeselEkonomiHesapla,
    _guvenliStopUygula: guvenliStopUygula
};
