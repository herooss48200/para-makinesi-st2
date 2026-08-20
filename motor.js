'use strict';

// AGROS ST2 R26 CORE-ONLY TRADE MOTOR
// Tek canlı yol: ST2 Renko -> Direct/Confirmed -> Premier/N5 -> Binance real execution.

const ayarlar = require('./ayarlar.js');
const adaptiveDnaEntry = require('./76_st2_adaptive_dna_entry.js');
const h = require('./1_hafiza.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');
const realOrderBridge = require('./50_real_order_readiness_bridge.js');
const identityChain = require('./66_identity_chain_repair.js');
const premierQuality = require('./83_st2_premier_quality_score.js');
const realExecution = require('./85_st2_real_order_execution.js');
const symbolLeveragePolicy = require('./91_st2_symbol_leverage_policy.js');

function ondalikSayisi(step) {
    const s = String(step);
    if (s.includes('e-')) return Number(s.split('e-')[1]) || 0;
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
}

function miktarKlip(sym, miktar) {
    const kural = h.state.basamaklar?.[sym];
    const raw = Number(miktar);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (!kural) return Number(raw.toFixed(8));
    const step = Number(kural.stepSize) || Math.pow(10, -Number(kural.quantityPrecision || 8));
    const precision = Math.max(ondalikSayisi(step), Number(kural.quantityPrecision || 0));
    const clipped = Math.floor((raw + step * 1e-9) / step) * step;
    return Number(clipped.toFixed(Math.min(12, precision)));
}

function gercekMiktarHedefeEnYakinKlip(sym, miktar) {
    const kural = h.state.basamaklar?.[sym];
    const raw = Number(miktar);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (!kural) return Number(raw.toFixed(8));
    const step = Number(kural.stepSize) || Math.pow(10, -Number(kural.quantityPrecision || 8));
    const precision = Math.max(ondalikSayisi(step), Number(kural.quantityPrecision || 0));
    const nearest = Math.round(raw / step) * step;
    return Number(nearest.toFixed(Math.min(12, precision)));
}

function fiyatKlip(sym, fiyat) {
    const ham = Number(fiyat);
    if (!Number.isFinite(ham) || ham <= 0) return 0;
    const kural = h.state.basamaklar?.[sym];
    if (!kural) return Number(ham.toFixed(8));
    const tick = Number(kural.tickSize) || Math.pow(10, -Number(kural.pricePrecision || 8));
    if (!Number.isFinite(tick) || tick <= 0) return Number(ham.toFixed(Math.max(0, Number(kural.pricePrecision || 8))));
    const precision = Math.max(ondalikSayisi(tick), Number(kural.pricePrecision || 0));
    const duzeltilmis = Math.round(ham / tick) * tick;
    const sonuc = Number(duzeltilmis.toFixed(Math.min(12, precision)));
    return Number.isFinite(sonuc) && sonuc > 0 ? sonuc : 0;
}

function canliRiskProfili() {
    return realOrderBridge.liveRiskProfile();
}

function aktifGercekPozisyonSayisi() {
    return (h.state.aktifPozisyonlar || []).filter(pos => pos?.sanal === false).length;
}


function renkoYapisalStopPlani(symbol, yon, referencePrice, girisAnalizi = {}) {
    const entry = Number(referencePrice || 0);
    const side = String(yon || '').toUpperCase();
    const hardCapPct = Math.max(0.05, Number(ayarlar.renkoYapisalStopMaksRiskYuzde || ayarlar.sabitStopYuzdesi || 2.5));
    const hardCap = side === 'LONG' ? entry * (1 - hardCapPct / 100) : entry * (1 + hardCapPct / 100);
    if (ayarlar.renkoYapisalStopAktif !== true || girisAnalizi?.entryStrategy !== 'ST2_RENKO') {
        return { valid: entry > 0, stop: fiyatKlip(symbol, hardCap), source: 'PERCENT_HARD_CAP', hardCapPct };
    }
    const c = girisAnalizi?.confirmationGate?.reversal || girisAnalizi?.pusuTuglasi?.confirmation15m || {};
    const previous = c?.previous || {};
    const box = Number(girisAnalizi?.confirmationGate?.boxSize || girisAnalizi?.pusuTuglasi?.confirmation15m?.boxSize || girisAnalizi?.renkoBoxSize || 0);
    const bufferT = Math.max(0, Number(ayarlar.renkoYapisalStopBufferT ?? 0.25));
    const edge = side === 'LONG'
        ? Number(previous?.low || girisAnalizi?.pusuTuglasi?.confirmation15m?.previousLow || 0)
        : Number(previous?.high || girisAnalizi?.pusuTuglasi?.confirmation15m?.previousHigh || 0);
    if (!(entry > 0) || !(box > 0) || !(edge > 0) || !['LONG','SHORT'].includes(side)) {
        return { valid: false, reason: 'STRUCTURAL_STOP_REFERENCE_MISSING', entry, box, edge, side };
    }
    const structural = side === 'LONG' ? edge - bufferT * box : edge + bufferT * box;
    const stopRaw = side === 'LONG' ? Math.max(structural, hardCap) : Math.min(structural, hardCap);
    const stop = fiyatKlip(symbol, stopRaw);
    const correctSide = side === 'LONG' ? stop < entry : stop > entry;
    if (!(stop > 0) || !correctSide) {
        return { valid: false, reason: 'STRUCTURAL_STOP_INVALID_SIDE', entry, structural, hardCap, stop, side };
    }
    const riskPct = Math.abs((stop / entry - 1) * 100);
    return {
        valid: true, stop, structuralStop: fiyatKlip(symbol, structural), hardCapStop: fiyatKlip(symbol, hardCap),
        hardCapPct, bufferT, boxSize: box, referenceEdge: edge, riskPct,
        source: Math.abs(stop - structural) <= Math.max(1e-12, Number(h.state.basamaklar?.[symbol]?.tickSize || 0)/2)
            ? `RENKO_STRUCTURE_${bufferT.toFixed(2)}T` : `RENKO_STRUCTURE_${bufferT.toFixed(2)}T_HARD_CAP`
    };
}


function requestedEntryStrategy(girisAnalizi = {}) {
    return String(girisAnalizi?.entryStrategy || 'ST2_RENKO').trim().toUpperCase();
}

function gercekSembolKuraliGecerli(kural) {
    if (!kural || typeof kural !== 'object') return false;
    return Number(kural.stepSize) > 0 && Number(kural.tickSize) > 0 &&
        Number(kural.minQty || 0) >= 0 && Number(kural.minNotional || 0) >= 0 &&
        Number.isInteger(Number(kural.pricePrecision)) && Number.isInteger(Number(kural.quantityPrecision));
}

function gercekDirectTuglaKapisi(girisAnalizi = {}) {
    const strategy = String(girisAnalizi?.entryStrategy || '').toUpperCase();
    const mode = String(girisAnalizi?.entryMode || '').toUpperCase();
    const brick = Number(girisAnalizi?.renkoEntryBrickDistance ?? girisAnalizi?.entryModeOffsetT);
    if (ayarlar.gercekDirectTuglaFiltreAktif !== true) return { allowed: true, reason: 'FILTER_DISABLED', mode, brick };
    if (strategy !== 'ST2_RENKO') return { allowed: false, reason: 'CORE_ONLY_ST2_REQUIRED', mode, brick, allowedBricks: [] };
    if (mode === 'CONFIRMED') return { allowed: true, reason: 'CONFIRMED_EXEMPT', mode, brick };
    if (mode !== 'DIRECT') return { allowed: false, reason: `ST2_ENTRY_MODE_INVALID:${mode || 'MISSING'}`, mode, brick, allowedBricks: [] };
    const allowedBricks = (Array.isArray(ayarlar.gercekDirectIzinliTuglalar) ? ayarlar.gercekDirectIzinliTuglalar : [])
        .map(Number).filter(Number.isFinite);
    const allowed = Number.isFinite(brick) && allowedBricks.some(x => Math.abs(x - brick) <= 1e-9);
    return { allowed, reason: allowed ? 'DIRECT_T_ALLOWED' : `DIRECT_T_NOT_ALLOWED:${Number.isFinite(brick) ? brick.toFixed(2) : 'INVALID'}T`, mode, brick, allowedBricks };
}

function st2PremierScoreBagla(pos, girisAnalizi, symbol, yon) {
    let labKarar = pos?.labPremierDecision || null;
    if (!pos || girisAnalizi?.entryStrategy !== 'ST2_RENKO') return labKarar;

    // Açık pozisyonun Premier/N5 kimliği immutable. N5 yalnız YENİ giriş kararını değiştirir.
    if (pos.premierSelectionFrozenAtOpen === true && pos.labPremierDecision?.premierScore) return pos.labPremierDecision;

    const gate = girisAnalizi.historicalEntryGate || adaptiveDnaEntry.gateDecision(
        { ...pos, ...girisAnalizi, girisAnalizi },
        Number(girisAnalizi.renkoEntryBrickDistance || 0.75)
    );
    const labLiveReview = labKarar?.liveLeagueReview || null;
    const previousScoreLeague = labKarar?.upperLayerIncluded === true ? 'PREMIER' : 'SHADOW';

    // R25.3 korunur: N5 > Renko Premier > OOS COIN veto > calibrated Score.
    const adjustedScore = premierQuality.applyLabReview(gate.premierScore || {}, labLiveReview);
    const finalScore = premierQuality.resolveSelectionAuthority(adjustedScore, labLiveReview, {
        labKey: labKarar?.labKey || pos?.labIdentityKey || '',
        baseTrack: labKarar?.basePremierTrack || labKarar?.premierTrack || ''
    });

    const renkoPremier = {
        premier: finalScore.selected === true,
        reason: finalScore.reason || gate.reason,
        patternKey: `${gate.context?.yon || yon}|${gate.context?.pattern || girisAnalizi.patternKodu || 'UNKNOWN'}`,
        dnaKey: adaptiveDnaEntry.dnaKey(gate.context || adaptiveDnaEntry.contextFrom(girisAnalizi)),
        source: gate.decision?.source || gate.evidence?.source || 'NONE',
        closed: Number(gate.evidence?.n || 0),
        activeBrick: Number(gate.brick || girisAnalizi.renkoEntryBrickDistance || 0.75),
        net: Number(gate.evidence?.net || 0), pf: Number(gate.evidence?.pf || 0), expectancy: Number(gate.evidence?.expectancy || 0),
        executionMode: finalScore.executionMode || gate.executionMode,
        premierScore: finalScore,
        score: Number(finalScore.score || 0), scoreThreshold: Number(finalScore.threshold || 0),
        relativeRank: Number(finalScore.rank || 0), relativeCohort: Number(finalScore.cohortSize || 0),
        evaluatedAt: new Date().toISOString(),
        authority: finalScore.selectionAuthority?.authority || 'PREMIER_QUALITY_SCORE'
    };
    pos.renkoPremierDecision = renkoPremier;

    const selected = finalScore.selected === true;
    const scoreTransition = {
        from: previousScoreLeague,
        to: selected ? 'PREMIER' : 'SHADOW',
        changed: previousScoreLeague !== (selected ? 'PREMIER' : 'SHADOW'),
        reason: finalScore.explanation || finalScore.reason
    };

    if (selected) {
        const authority = String(finalScore.selectionAuthority?.authority || 'PREMIER_QUALITY_SCORE').toUpperCase();
        const finalTrack = authority === 'LAB_LIVE_N5_ECONOMY'
            ? 'LAB_LIVE_PROMOTED_PREMIER'
            : (authority === 'RENKO_PATTERN_PREMIER' ? 'RENKO_PATTERN_PREMIER' : 'PREMIER_SCORE_RANKED');
        const finalProof = authority === 'LAB_LIVE_N5_ECONOMY'
            ? 'LAB_LIVE_N5_PROMOTED_PREMIER'
            : (authority === 'RENKO_PATTERN_PREMIER' ? 'RENKO_PATTERN_PREMIER_PRESERVED' : 'ST2_PREMIER_SCORE_SELECTED');
        const calibrated = String(finalScore.policySource || '').toUpperCase() === 'CALIBRATED';
        labKarar = {
            ...(labKarar || {}),
            labLeague: 'PREMIER', premierTrack: finalTrack, proofLevel: finalProof,
            upperLayerIncluded: true, virtualShadowOnly: false, observationEligible: false,
            realTradingAuthorized: Boolean(pos.sanal === false && calibrated && ayarlar.n5GercekEmirYetkisi === true),
            premierScore: finalScore, scoreTransition,
            reason: `${finalScore.explanation} | ${premierQuality.componentText(finalScore)}`
        };
        pos.labLeagueAtOpen = 'PREMIER';
        pos.premierTrackAtOpen = finalTrack;
        pos.labProofLevelAtOpen = finalProof;
        pos.leagueShadowOnly = false;
        console.log(`🏆 [ST2 PREMIER/N5] ${symbol} ${yon} | ${finalScore.explanation} | ${premierQuality.componentText(finalScore)}`);
    } else {
        const finalShadowReason = finalScore.reason || 'PREMIER_SCORE_REJECTED';
        labKarar = {
            ...(labKarar || {}),
            labLeague: 'DEVELOPMENT', premierTrack: 'PREMIER_SCORE_REJECTED', proofLevel: finalShadowReason,
            upperLayerIncluded: false, virtualShadowOnly: true, observationEligible: false,
            realTradingAuthorized: false, premierScore: finalScore, scoreTransition,
            reason: `${finalScore.explanation || finalShadowReason} | ${premierQuality.componentText(finalScore)}`
        };
        pos.labLeagueAtOpen = 'DEVELOPMENT';
        pos.premierTrackAtOpen = 'PREMIER_SCORE_REJECTED';
        pos.labProofLevelAtOpen = finalShadowReason;
        pos.leagueShadowOnly = true;
        console.log(`🚫 [ST2 PREMIER/N5 RED] ${symbol} ${yon} | ${finalScore.explanation || finalShadowReason}`);
    }

    pos.labPremierDecision = labKarar;
    pos.premierSelectionFrozenAtOpen = true;
    pos.premierSelectionFrozenAt = pos.premierSelectionFrozenAt || new Date().toISOString();
    return labKarar;
}

async function pozisyonAc(symbol, yon, canliFiyat, girisAnalizi = null) {
    try {
        const requestedStrategy = requestedEntryStrategy(girisAnalizi || {});
        const strategyLane = 'RENKO';
        if (ayarlar.entryStrategyMode !== 'ST2_RENKO' || requestedStrategy !== 'ST2_RENKO') {
            console.log(`⛔ [RENKO ONLY] ${symbol} ${yon} | Strateji modu ${ayarlar.entryStrategyMode} / istek ${requestedStrategy}`);
            return false;
        }
        if (ayarlar.sanalEmirModu) {
            console.log(`⛔ [CORE_ONLY] ${symbol} ${yon} | Sanal/Shadow pozisyon yaşamı R26 canlı runtime'dan kaldırıldı`);
            return false;
        }

        const manualLockUntil = Number(h.state.manualCloseLocks?.[`${symbol}|${yon}`] || 0);
        if (manualLockUntil > Date.now()) {
            console.log(`🖐️ [MANUEL KAPANIŞ KİLİDİ] ${symbol} ${yon} | ${new Date(manualLockUntil).toISOString()}`);
            return false;
        }

        const risk = canliRiskProfili();
        const maxReal = Number(risk.maxActivePositions);
        const izin = kaliciHafiza.emirAcilabilirMi(symbol, yon, {
            maxPozisyonSayisi: Number.isInteger(maxReal) && maxReal >= 0 ? maxReal : 0,
            ignoreDailyLimit: false
        });
        if (!izin.uygun) {
            console.log(`🛡️ [EMİR ENGELLENDİ] ${symbol} ${yon} | ${izin.sebep}`);
            return false;
        }

        const kural = h.state.basamaklar?.[symbol] || {};
        if (!gercekSembolKuraliGecerli(kural)) {
            console.log(`🚫 [GERÇEK SEMBOL KURALI FAIL-CLOSED] ${symbol} ${yon}`);
            return false;
        }
        if (!(risk.marginUsdt > 0) || !(risk.notionalUsdt > 0) ||
            !(Number.isInteger(risk.leverage) && risk.leverage >= 1 && risk.leverage <= 125) ||
            !['ISOLATED', 'CROSSED'].includes(risk.marginType) || !(Number.isInteger(maxReal) && maxReal > 0)) {
            console.log(`🚫 [GERÇEK RİSK FAIL-CLOSED] ${symbol} ${yon}`);
            return false;
        }
        if (aktifGercekPozisyonSayisi() >= maxReal) {
            console.log(`🚫 [GERÇEK SLOT DOLU] ${symbol} ${yon} | ${aktifGercekPozisyonSayisi()}/${maxReal}`);
            return false;
        }
        const symbolOccupied = (h.state.aktifPozisyonlar || []).some(pos => pos?.sanal === false && String(pos?.sym || '').toUpperCase() === String(symbol).toUpperCase());
        if (symbolOccupied) {
            console.log(`🚫 [STRATEJİ ÇAKIŞMASI] ${symbol} ${yon} | Binance one-way: sembolde başka gerçek pozisyon var`);
            return false;
        }

        const pPrecision = Number(kural.pricePrecision ?? 4);
        const minQty = Number(kural.minQty || 0);
        const minNotional = Number(kural.minNotional || 5);
        const etkinStopYuzdesi = Number(ayarlar.sabitStopYuzdesi || 2.5);
        const tpYuzdesi = Number(ayarlar.maxTpYuzdesi || 10);
        const tpOrani = tpYuzdesi / 100;
        const etkinGirisAnalizi = { ...(girisAnalizi || {}), entryStrategy: requestedStrategy, strategyLane };
        const preStopPlan = renkoYapisalStopPlani(symbol, yon, canliFiyat, etkinGirisAnalizi);
        if (!preStopPlan.valid) {
            console.log(`🧯 [YAPISAL STOP ENTRY RED] ${symbol} ${yon} | ${preStopPlan.reason || 'INVALID'} | TF ${etkinGirisAnalizi.sourceTimeframe || etkinGirisAnalizi.pusuPeriyodu || '15m'}`);
            return false;
        }
        let sl = preStopPlan.stop;
        let tp = fiyatKlip(symbol, yon === 'LONG' ? canliFiyat * (1 + tpOrani) : canliFiyat * (1 - tpOrani));
        etkinGirisAnalizi.initialStopPlan = { ...preStopPlan, frozenAt: new Date().toISOString() };
        const hazirKimlik = {
            sym: symbol, yon, girisFiyati: Number(canliFiyat), sl, tp,
            miktar: miktarKlip(symbol, risk.notionalUsdt / Number(canliFiyat)),
            sanal: false, acilisZamani: Date.now(), entryStrategy: requestedStrategy, strategyLane, girisAnalizi: etkinGirisAnalizi
        };

        // Renko Premier/N5 otoritesi aynen korunur.
        await identityChain.prepare(hazirKimlik, { realMode: true });
        const labGercekKarar = st2PremierScoreBagla(hazirKimlik, etkinGirisAnalizi, symbol, yon);
        if (!labGercekKarar.realTradingAuthorized) {
            console.log(`🚫 [PREMIER/N5 GERÇEK RED] ${symbol} ${yon} | ${labGercekKarar.proofLevel}`);
            return false;
        }

        const auth = realOrderBridge.realAuthorization();
        if (!auth.valid) {
            console.log(`🚫 [GERÇEK EMİR YETKİ FAIL-CLOSED] ${symbol} ${yon}`);
            return false;
        }

        const directGate = gercekDirectTuglaKapisi(etkinGirisAnalizi);
        if (!directGate.allowed) {
            console.log(`🛡️ [DIRECT T MOTOR FAIL-CLOSED] ${symbol} ${yon} | ${directGate.reason}`);
            return false;
        }

        const safety = h.state.st2RealEntrySafety || {};
        if (safety.ready !== true) {
            console.log(`🛡️ [ST2 CONTROL PLANE FAIL-CLOSED] ${symbol} ${yon} | ${safety.reason || 'NOT_READY'}`);
            return false;
        }

        const ligBoyutCarpani = 1;
        let hedefGercekNotional = risk.notionalUsdt;
        let gercekMiktar = gercekMiktarHedefeEnYakinKlip(symbol, hedefGercekNotional / canliFiyat);
        let gercekNotional = gercekMiktar * canliFiyat;
        const hedefUstuEpsilon = Math.max(1e-12, hedefGercekNotional * 1e-12);
        if (gercekNotional > hedefGercekNotional + hedefUstuEpsilon) {
            gercekMiktar = miktarKlip(symbol, hedefGercekNotional / canliFiyat);
            gercekNotional = gercekMiktar * canliFiyat;
        }
        const maksNotionalSapmaYuzde = Number(ayarlar.gercekEmirMaksNotionalSapmaYuzde);
        const maksLotSizeAsagiSapmaYuzde = Number(ayarlar.gercekEmirLotSizeAsagiSapmaYuzde);
        const lotSizeAsagiSapmaYuzde = hedefGercekNotional > 0
            ? Math.max(0, ((hedefGercekNotional - gercekNotional) / hedefGercekNotional) * 100) : 999;
        if (!gercekMiktar || gercekMiktar < minQty || gercekNotional < minNotional ||
            gercekNotional > hedefGercekNotional + hedefUstuEpsilon ||
            !Number.isFinite(maksNotionalSapmaYuzde) || !Number.isFinite(maksLotSizeAsagiSapmaYuzde) ||
            lotSizeAsagiSapmaYuzde > maksLotSizeAsagiSapmaYuzde) {
            console.log(`🚫 [GERÇEK BOYUT FAIL-CLOSED] ${symbol} ${yon} | Qty ${gercekMiktar} | Notional ${gercekNotional}`);
            return false;
        }

        const reservation = await realExecution.reserveEntry({ symbol, side: yon, context: hazirKimlik, client: h.client });
        if (!reservation.ok) {
            console.log(`🚫 [GERÇEK PREFLIGHT] ${symbol} ${yon} | ${reservation.reason}`);
            return false;
        }

        let kaldirac = risk.leverage;
        let fill = null;
        let protections = null;
        try {
            await h.client.futuresMarginType({ symbol, marginType: risk.marginType }).catch(err => {
                const text = String(err?.message || err || '');
                if (!text.includes('-4046') && !/no need to change margin type/i.test(text)) throw err;
            });
            const leverageDecision = await symbolLeveragePolicy.negotiate({
                symbol, requestedLeverage: kaldirac, client: h.client,
                allowFallback: ayarlar.gercekEmirKaldiracFallbackAktif === true
            });
            kaldirac = leverageDecision.effective;
            if (kaldirac !== risk.leverage) {
                hedefGercekNotional = risk.marginUsdt * kaldirac;
                gercekMiktar = miktarKlip(symbol, hedefGercekNotional / canliFiyat);
                gercekNotional = gercekMiktar * canliFiyat;
                if (!gercekMiktar || gercekMiktar < minQty || gercekNotional < minNotional) throw new Error('KALDIRAC_FALLBACK_BOYUT_FAIL_CLOSED');
            }

            console.log(`📤 [GERÇEK EMİR] ${symbol} ${yon} | ${gercekMiktar} | ${hedefGercekNotional.toFixed(2)} USDT`);
            fill = await realExecution.executeEntry({
                reservation, quantity: gercekMiktar, referencePrice: canliFiyat,
                minQty, minNotional, maxNotionalDeviationPct: maksNotionalSapmaYuzde, client: h.client
            });
            if (fill?.ok === false) {
                if (fill.vetoed === true && fill.reason === 'ONUR_FINAL_SHORT_HARD_VETO') {
                    console.log(`🛡️ [CORE ENTRY VETO] ${symbol} ${yon} | ${fill.reason} | Gerçek MARKET emir gönderilmedi`);
                    return false;
                }
                throw new Error(fill.reason || 'GERCEK_ENTRY_EXECUTION_REJECTED');
            }

            const fillPrice = Number(fill.avgPrice);
            const fillStopPlan = renkoYapisalStopPlani(symbol, yon, fillPrice, etkinGirisAnalizi);
            if (!fillStopPlan.valid) throw new Error(`YAPISAL_STOP_FILL_FAIL_CLOSED:${fillStopPlan.reason || 'INVALID'}`);
            sl = fillStopPlan.stop;
            tp = fiyatKlip(symbol, yon === 'LONG' ? fillPrice * (1 + tpOrani) : fillPrice * (1 - tpOrani));
            etkinGirisAnalizi.initialStopPlan = { ...fillStopPlan, frozenAt: etkinGirisAnalizi.initialStopPlan?.frozenAt || new Date().toISOString(), fillValidatedAt: new Date().toISOString() };
            protections = await realExecution.installProtections({
                reservation, side: yon, stopPrice: sl.toFixed(pPrecision), takeProfitPrice: tp.toFixed(pPrecision), client: h.client
            });
        } catch (executionError) {
            console.error(`🚨 [GERÇEK AÇILIŞ ZİNCİRİ HATASI] ${symbol} ${yon} | ${executionError.message}`);
            const rollback = await realExecution.rollbackEntry({ reservation, side: yon, reason: executionError.message, client: h.client })
                .catch(err => ({ ok: false, reason: err.message }));
            await h.telegramMesajGonderKritikTeslim(`🚨 GERÇEK EMİR FAIL-CLOSED\n${symbol} ${yon}\nHata: ${executionError.message}\nRollback: ${rollback.ok ? 'DOĞRULANDI' : 'BAŞARISIZ'}`, { coalesceKey: `real-entry-fail:${reservation.fingerprint}` }).catch(err => console.error(`⚠️ [GERÇEK FAIL-CLOSED TELEGRAM] ${symbol} | ${err.message}`));
            return false;
        }

        const gerceklesenMiktar = miktarKlip(symbol, fill.actualQty);
        const gerceklesenFiyat = Number(fill.avgPrice);
        const gerceklesenNotional = gerceklesenMiktar * gerceklesenFiyat;
        const yeniPozisyon = {
            sym: symbol, yon, girisFiyati: gerceklesenFiyat, sl, tp, miktar: gerceklesenMiktar,
            hedefNotionalUsdt: Number(hedefGercekNotional.toFixed(6)),
            gerceklesenNotionalUsdt: Number(gerceklesenNotional.toFixed(6)),
            kaldirac, marjinTipi: risk.marginType, ligBoyutCarpani,
            entryStrategy: requestedStrategy, strategyLane,
            gercekLig: 'PREMIER', sanal: false, borsaOrderId: fill.order?.orderId || null,
            acilisZamani: Number.isFinite(Date.parse(String(fill.fillVerifiedAt || ''))) ? Date.parse(String(fill.fillVerifiedAt)) : Date.now(), mevcutTpYuzdesi: 0, tpKademe: 0, sonTpSeviyesi: tp,
            breakevenAktif: false, girisAnalizi: etkinGirisAnalizi,
            sourceTimeframe: etkinGirisAnalizi.sourceTimeframe || etkinGirisAnalizi.pusuPeriyodu || '15m',
            initialStopPlan: etkinGirisAnalizi.initialStopPlan || null,
            renkoPremierDecision: hazirKimlik.renkoPremierDecision,
            labPremierDecision: hazirKimlik.labPremierDecision,
            dnaId: hazirKimlik.dnaId, dnaLabel: hazirKimlik.dnaLabel, dnaIdentityKey: hazirKimlik.dnaIdentityKey,
            labDnaId: hazirKimlik.labDnaId, labDnaLabel: hazirKimlik.labDnaLabel, labIdentityKey: hazirKimlik.labIdentityKey,
            fullDnaId: hazirKimlik.fullDnaId, fullDnaLabel: hazirKimlik.fullDnaLabel, fullIdentityKey: hazirKimlik.fullIdentityKey,
            labLeagueAtOpen: hazirKimlik.labLeagueAtOpen, premierTrackAtOpen: hazirKimlik.premierTrackAtOpen,
            labProofLevelAtOpen: hazirKimlik.labProofLevelAtOpen,
            premierSelectionFrozenAtOpen: hazirKimlik.premierSelectionFrozenAtOpen === true,
            premierSelectionFrozenAt: hazirKimlik.premierSelectionFrozenAt || null,
            korumaEmirleri: {
                slAlgoId: protections.stop?.algoId || null,
                slClientAlgoId: protections.stop?.clientAlgoId || reservation.ids.stop,
                tpAlgoId: protections.takeProfit?.algoId || null,
                tpClientAlgoId: protections.takeProfit?.clientAlgoId || reservation.ids.takeProfit
            }
        };
        realExecution.markOpen(reservation, yeniPozisyon, protections, { entryOrder: fill.order, ambiguityRecovered: fill.ambiguityRecovered });
        h.state.aktifPozisyonlar.push(yeniPozisyon);
        if (yon === 'LONG') h.state.alinanlar = [...new Set([...(h.state.alinanlar || []), symbol])];
        else h.state.aktifShortlar = [...new Set([...(h.state.aktifShortlar || []), symbol])];
        h.state.basariOzeti.toplamAcilanEmir = Number(h.state.basariOzeti.toplamAcilanEmir || 0) + 1;
        kaliciHafiza.yeniEmirSay();

        if (ayarlar.telegramIslemAcilisMesaji === true) {
            const score = yeniPozisyon.renkoPremierDecision?.premierScore || {};
            const scoreText = `⭐ Score ${Number(score.score || 0).toFixed(1)}/${Number(score.threshold || 0).toFixed(1)} | Sıra #${Number(score.rank || 0)}/${Number(score.cohortSize || 0)}
`;
            const openMessage =
                `<b>✅ GERÇEK POZİSYON AÇILDI</b>

` +
                `🔀 ${symbol} ${yon} | 🧱 RENKO REAL / PREMIER | ⏱️ ${yeniPozisyon.sourceTimeframe}
` +
                scoreText +
                `🕒 Giriş ${new Date(yeniPozisyon.acilisZamani).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',hour12:false})}
` +
                `Giriş ${gerceklesenFiyat} | SL ${sl} | TP ${tp}
` +
                `🛡️ İlk stop ${yeniPozisyon.initialStopPlan?.source || 'PERCENT'} | Risk %${Number(yeniPozisyon.initialStopPlan?.riskPct || etkinStopYuzdesi).toFixed(2)}
` +
                `Notional ${gerceklesenNotional.toFixed(2)} USDT | ${kaldirac}x
` +
                `Mode ${etkinGirisAnalizi.entryMode || 'YOK'} | ${Number(etkinGirisAnalizi.renkoEntryBrickDistance || 0).toFixed(2)}T`;
            setImmediate(() => {
                Promise.resolve(h.telegramMesajGonderKritikTeslim(openMessage, { coalesceKey: `real-open:${reservation.fingerprint}` }))
                    .then(telegramOpenResults => {
                        const telegramOpenOk = Array.isArray(telegramOpenResults) && telegramOpenResults.length > 0 && telegramOpenResults.every(x => x?.sonuc?.ok === true || x?.sonuc?.ambiguousDelivery === true);
                        console.log(`${telegramOpenOk ? '✅' : '⚠️'} [GERÇEK AÇILIŞ TELEGRAM] ${symbol} ${yon} | ${telegramOpenOk ? 'TESLİM' : 'TESLİM DOĞRULANAMADI'}`);
                    })
                    .catch(err => console.error(`⚠️ [GERÇEK AÇILIŞ TELEGRAM] ${symbol} ${yon} | ${err.message}`));
            });
        }
        console.log(`✅ [CORE REAL OPEN] ${symbol} ${yon} | ${strategyLane} | ${gerceklesenNotional.toFixed(2)} USDT`);
        return true;
    } catch (e) {
        console.error(`❌ [CORE ENTRY HATASI] ${symbol} ${yon} | ${e.message || e}`);
        return false;
    }
}

async function pozisyonKapat(symbol, yon) {
    try {
        const pos = (h.state.aktifPozisyonlar || []).find(x => x.sym === symbol && x.yon === yon && x.sanal === false);
        const sonuc = await realExecution.closePositionMarket(pos || { sym: symbol, yon, sanal: false }, 'TRADE_ENGINE_CLOSE', h.client);
        if (sonuc.ok) {
            if (pos) pos.realizedExecution = sonuc;
            console.log(`✅ [GERÇEK KAPATMA MUTABAKATI] ${symbol} ${yon} | Net ${Number(sonuc.netPnl || 0).toFixed(6)}`);
            return true;
        }
        console.error(`🚨 [GERÇEK KAPATMA BAŞARISIZ] ${symbol} ${yon} | ${sonuc.reason}`);
        return false;
    } catch (e) {
        console.error(`❌ [BINANCE API KAPATMA HATASI] ${symbol}: ${e.message || e}`);
        return false;
    }
}

function hesaplaBollinger(fiyatDizisi) {
    if (!fiyatDizisi || fiyatDizisi.length < ayarlar.bollingerperiod) return { mid: 0, upper: [], lower: [] };
    const son = fiyatDizisi.slice(-ayarlar.bollingerperiod);
    const mid = son.reduce((a, b) => a + b, 0) / ayarlar.bollingerperiod;
    const varyans = son.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / ayarlar.bollingerperiod;
    const sapma = Math.sqrt(varyans);
    return { mid, upper: [mid + ((ayarlar.bollingercarpani || 2) * sapma)], lower: [mid - ((ayarlar.bollingercarpani || 2) * sapma)] };
}

function hesaplaSuperTrend(mumlar, period = ayarlar.superTrendPeriod || 10, multiplier = ayarlar.superTrendMultiplier || 3) {
    if (!mumlar || mumlar.length < period + 2) return { trend: null, value: 0 };
    const tr = [];
    for (let i = 0; i < mumlar.length; i++) {
        if (i === 0) tr.push(mumlar[i].high - mumlar[i].low);
        else tr.push(Math.max(mumlar[i].high - mumlar[i].low, Math.abs(mumlar[i].high - mumlar[i - 1].close), Math.abs(mumlar[i].low - mumlar[i - 1].close)));
    }
    const atr = new Array(mumlar.length).fill(null);
    let toplam = 0;
    for (let i = 0; i < period; i++) toplam += tr[i];
    atr[period - 1] = toplam / period;
    for (let i = period; i < mumlar.length; i++) atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
    const finalUpper = new Array(mumlar.length).fill(null);
    const finalLower = new Array(mumlar.length).fill(null);
    const superTrend = new Array(mumlar.length).fill(null);
    let trend = 'UP';
    for (let i = period; i < mumlar.length; i++) {
        const hl2 = (mumlar[i].high + mumlar[i].low) / 2;
        const basicUpper = hl2 + multiplier * atr[i];
        const basicLower = hl2 - multiplier * atr[i];
        if (i === period) {
            finalUpper[i] = basicUpper; finalLower[i] = basicLower;
            trend = mumlar[i].close >= basicLower ? 'UP' : 'DOWN';
            superTrend[i] = trend === 'UP' ? finalLower[i] : finalUpper[i];
            continue;
        }
        finalUpper[i] = (basicUpper < finalUpper[i - 1] || mumlar[i - 1].close > finalUpper[i - 1]) ? basicUpper : finalUpper[i - 1];
        finalLower[i] = (basicLower > finalLower[i - 1] || mumlar[i - 1].close < finalLower[i - 1]) ? basicLower : finalLower[i - 1];
        if (superTrend[i - 1] === finalUpper[i - 1]) trend = mumlar[i].close <= finalUpper[i] ? 'DOWN' : 'UP';
        else trend = mumlar[i].close >= finalLower[i] ? 'UP' : 'DOWN';
        superTrend[i] = trend === 'UP' ? finalLower[i] : finalUpper[i];
    }
    const sonIndex = mumlar.length - 1;
    return { trend, value: superTrend[sonIndex] || 0 };
}

module.exports = {
    pozisyonAc,
    pozisyonKapat,
    hesaplaBollinger,
    hesaplaSuperTrend,
    miktarKlip,
    gercekMiktarHedefeEnYakinKlip,
    fiyatKlip,
    gercekDirectTuglaKapisi,
    renkoYapisalStopPlani,
    _st2PremierScoreBagla: st2PremierScoreBagla
};
