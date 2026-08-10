const ayarlar = require('./ayarlar.js');
const renkoExitEvolution = require('./74_st2_renko_exit_evolution.js');
const renkoEntryEvolution = require('./73_st2_renko_entry_evolution.js');
const adaptiveDnaEntry = require('./76_st2_adaptive_dna_entry.js');
const labLifecycle = require('./68_lab_lifecycle_evolution.js');
const h = require('./1_hafiza.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');
const analizMerkezi = require('./7_analiz_merkezi.js');
const blackbox = require('./8_blackbox.js');
const exitOptimizer = require('./15_exit_optimizer_foundation.js');
const positionSizingAudit = require('./19_position_sizing_audit.js');
const dnaExitSelector = require('./43_dna_exit_selector.js');
const dnaLeague = require('./46_dna_league_engine.js');
const premierObservation = require('./48_premier_observation_engine.js');
const labChampion = require('./61_lab_champion_engine.js');
const labPremier = require('./62_lab_premier_league.js');
const exitMethodScoreboard = require('./52_exit_method_scoreboard.js');
const accountingContinuity = require('./65_accounting_continuity.js');
const realOrderBridge = require('./50_real_order_readiness_bridge.js');
const identityChain = require('./66_identity_chain_repair.js');
const operationTransparency = require('./82_st2_operation_transparency.js');
const premierQuality = require('./83_st2_premier_quality_score.js');
const realExecution = require('./85_st2_real_order_execution.js');
const symbolLeveragePolicy = require('./91_st2_symbol_leverage_policy.js');

function ondalikSayisi(step) {
    const n = Number(step);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const s = String(n).toLowerCase();
    if (s.includes('e-')) {
        const [mantissa, exponentText] = s.split('e-');
        const exponent = Number(exponentText) || 0;
        const mantissaDecimals = (mantissa.split('.')[1] || '').replace(/0+$/, '').length;
        return exponent + mantissaDecimals;
    }
    if (!s.includes('.')) return 0;
    return (s.split('.')[1] || '').replace(/0+$/, '').length;
}

function miktarKlip(sym, miktar) {
    const kural = h.state.basamaklar[sym];
    if (!kural) return Number(miktar.toFixed(2));
    const step = kural.stepSize || Math.pow(10, -kural.quantityPrecision);
    const precision = ondalikSayisi(step);
    const duzeltilmis = Math.floor(miktar / step) * step;
    return Number(duzeltilmis.toFixed(precision));
}

// v6.13.5 — Gerçek notional için daima aşağı yuvarlamak bazı sembollerde
// hedef notionaldan izin verilen sınırın dışına düşürüyor (SOL: 0.13 => -%5.438).
// Binance stepSize'a uygun floor/ceil adayından hedef notionala en yakın olan seçilir.
// Risk kapısı yine minQty/minNotional/maxNotionalDeviation ile fail-closed kalır.
function gercekMiktarHedefeEnYakinKlip(sym, miktar) {
    const ham = Number(miktar);
    if (!(ham > 0)) return 0;
    const kural = h.state.basamaklar[sym];
    if (!kural) return Number(ham.toFixed(2));
    const step = Number(kural.stepSize) || Math.pow(10, -Number(kural.quantityPrecision || 0));
    if (!(step > 0)) return miktarKlip(sym, ham);
    const precision = ondalikSayisi(step);
    const units = ham / step;
    const floorQty = Math.max(0, Math.floor(units + 1e-12) * step);
    const ceilQty = Math.max(0, Math.ceil(units - 1e-12) * step);
    const candidates = [floorQty, ceilQty]
        .map(x => Number(x.toFixed(precision)))
        .filter((x, i, a) => x > 0 && a.indexOf(x) === i);
    if (!candidates.length) return 0;
    candidates.sort((a, b) => Math.abs(a - ham) - Math.abs(b - ham) || a - b);
    return candidates[0];
}



function miktarKapasiteEngeliVar(audit) {
    if (!audit) return false;
    const ayrilanNotional = Number(audit.toplamDolar || 0);
    const gerekliNotional = Number(audit.gerekliNotional || 0);
    const guvenliMiktar = Number(audit.guvenliMiktar || 0);
    const minQty = Number(audit.minQty || 0);
    const notional = Number(audit.notional || 0);
    const minNotional = Number(audit.minNotional || 0);

    return gerekliNotional > 0 && ayrilanNotional > 0 && ayrilanNotional < gerekliNotional &&
        (guvenliMiktar <= 0 || guvenliMiktar < minQty || notional < minNotional);
}

function miktarKapasiteEngeliniIsaretle(symbol, yon, audit) {
    h.state.sembolKapasiteEngeli = h.state.sembolKapasiteEngeli || {};
    const key = `${symbol}_${yon}`;
    h.state.sembolKapasiteEngeli[key] = {
        symbol,
        yon,
        sebep: audit?.sebep || 'KAPASITE_YETERSIZ',
        fiyat: audit?.fiyat || 0,
        ayrilanNotional: audit?.toplamDolar || 0,
        gerekliNotional: audit?.gerekliNotional || 0,
        gerekliMarjin: audit?.gerekliMarjin || 0,
        eksikMarjin: audit?.eksikMarjin || 0,
        zaman: Date.now()
    };
}

function miktarRedLoglaVePusuyuTemizle(symbol, yon, detay) {
    const risk = ayarlar.sanalEmirModu ? null : canliRiskProfili();
    const raporKaldirac = risk ? Number(risk.leverage) : Number(ayarlar.mevcutKaldirac);
    const raporMarjin = risk
        ? Number(risk.notionalUsdt) / Number(risk.leverage)
        : Number(ayarlar.calisilmakIstenenUsdtMiktar);
    positionSizingAudit.logla(h.state, {
        symbol,
        yon,
        sebep: detay.sebep || 'MIKTAR_RED',
        fiyat: detay.canliFiyat,
        marjin: raporMarjin,
        kaldirac: raporKaldirac,
        toplamDolar: detay.toplamDolar,
        hamMiktar: detay.hamMiktar,
        guvenliMiktar: detay.guvenliMiktar,
        notional: detay.notional,
        minQty: detay.minQty,
        minNotional: detay.minNotional,
        minQtyNotional: detay.minQtyNotional,
        gerekliNotional: detay.gerekliNotional,
        gerekliMarjin: detay.gerekliMarjin,
        eksikMarjin: detay.eksikMarjin,
        stepSize: detay.stepSize,
        quantityPrecision: detay.quantityPrecision,
        pricePrecision: detay.pricePrecision,
        zaman: Date.now()
    });

    if (h.state.pusuListesi && h.state.pusuListesi[symbol]) {
        delete h.state.pusuListesi[symbol];
    }
}

function fiyatKlip(sym, fiyat) {
    const ham = Number(fiyat);
    if (!Number.isFinite(ham) || ham <= 0) return 0;
    const kural = h.state.basamaklar[sym];
    if (!kural) return Number(ham.toFixed(8));
    const tick = Number(kural.tickSize) || Math.pow(10, -Number(kural.pricePrecision || 8));
    if (!Number.isFinite(tick) || tick <= 0) return Number(ham.toFixed(Math.max(0, Number(kural.pricePrecision || 8))));
    const precision = Math.max(ondalikSayisi(tick), Number(kural.pricePrecision || 0));
    const duzeltilmis = Math.round(ham / tick) * tick;
    const sonuc = Number(duzeltilmis.toFixed(Math.min(12, precision)));
    return Number.isFinite(sonuc) && sonuc > 0 ? sonuc : 0;
}


function st2PremierScoreBagla(pos, girisAnalizi, symbol, yon) {
    let labKarar = pos?.labPremierDecision || null;
    if (!pos || girisAnalizi?.entryStrategy !== 'ST2_RENKO') return labKarar;
    const gate = girisAnalizi.historicalEntryGate || adaptiveDnaEntry.gateDecision({ ...pos, ...girisAnalizi, girisAnalizi }, Number(girisAnalizi.renkoEntryBrickDistance || 0.75));
    const renkoPremier = {
        premier: gate.allow === true,
        reason: gate.reason,
        patternKey: `${gate.context?.yon || yon}|${gate.context?.pattern || girisAnalizi.patternKodu || 'UNKNOWN'}`,
        dnaKey: adaptiveDnaEntry.dnaKey(gate.context || adaptiveDnaEntry.contextFrom(girisAnalizi)),
        source: gate.decision?.source || gate.evidence?.source || 'NONE',
        closed: Number(gate.evidence?.n || 0),
        activeBrick: Number(gate.brick || girisAnalizi.renkoEntryBrickDistance || 0.75),
        net: Number(gate.evidence?.net || 0), pf: Number(gate.evidence?.pf || 0), expectancy: Number(gate.evidence?.expectancy || 0),
        executionMode: gate.executionMode,
        premierScore: gate.premierScore || null,
        score: Number(gate.premierScore?.score || 0),
        scoreThreshold: Number(gate.premierScore?.threshold || 0),
        relativeRank: Number(gate.premierScore?.rank || 0),
        relativeCohort: Number(gate.premierScore?.cohortSize || 0)
    };
    const labLiveReview = labKarar?.liveLeagueReview || null;
    const previousScoreLeague = labKarar?.upperLayerIncluded === true ? 'PREMIER' : 'SHADOW';
    const finalScore = premierQuality.applyLabReview(gate.premierScore || {}, labLiveReview);
    renkoPremier.premierScore = finalScore;
    renkoPremier.premier = finalScore.selected === true;
    renkoPremier.reason = finalScore.reason || gate.reason;
    renkoPremier.score = Number(finalScore.score || 0);
    renkoPremier.scoreThreshold = Number(finalScore.threshold || 0);
    renkoPremier.relativeRank = Number(finalScore.rank || 0);
    renkoPremier.relativeCohort = Number(finalScore.cohortSize || 0);
    renkoPremier.executionMode = finalScore.executionMode || gate.executionMode;
    pos.renkoPremierDecision = { ...renkoPremier, evaluatedAt: new Date().toISOString(), authority: 'ST2_PREMIER_QUALITY_SCORE' };
    // v6.7.3 compatibility proof: const finalPremier = !exactLiveDemoted && !labLiveDemoted
    const finalPremier = finalScore.selected === true;
    const finalScoreLeague = finalPremier ? 'PREMIER' : 'SHADOW';
    const scoreTransition = { from: previousScoreLeague, to: finalScoreLeague, changed: previousScoreLeague !== finalScoreLeague, reason: finalScore.explanation || finalScore.reason };
    if (finalPremier) {
        const finalTrack = 'PREMIER_SCORE_RANKED';
        const finalProof = 'ST2_PREMIER_SCORE_SELECTED';
        const calibrated = String(finalScore.policySource || '').toUpperCase() === 'CALIBRATED';
        labKarar = {
            ...(labKarar || {}),
            labLeague: 'PREMIER', premierTrack: finalTrack, proofLevel: finalProof,
            upperLayerIncluded: true, virtualShadowOnly: false, observationEligible: true,
            realTradingAuthorized: Boolean(pos.sanal === false && calibrated && ayarlar.labPremierGercekEmirYetkisi === true),
            premierScore: finalScore, scoreTransition,
            reason: `${finalScore.explanation} | ${premierQuality.componentText(finalScore)}`
        };
        pos.labPremierDecision = labKarar;
        pos.labLeagueAtOpen = 'PREMIER';
        pos.premierTrackAtOpen = finalTrack;
        pos.labProofLevelAtOpen = finalProof;
        pos.leagueShadowOnly = false;
        console.log(`🏆 [ST2 PREMIER SCORE BINDING] ${symbol} ${yon} | ${finalScore.explanation} | ${premierQuality.componentText(finalScore)} | Giriş ${renkoPremier.activeBrick.toFixed(2)} | Model ${finalScore.policySource || 'DEFAULT'}`);
    } else {
        const finalShadowReason = finalScore.reason || 'PREMIER_SCORE_SHADOW';
        labKarar = {
            ...(labKarar || {}), labLeague: 'DEVELOPMENT', premierTrack: 'PREMIER_SCORE_SHADOW',
            proofLevel: finalShadowReason, upperLayerIncluded: false, virtualShadowOnly: true,
            observationEligible: true, realTradingAuthorized: false, premierScore: finalScore, scoreTransition,
            reason: `${finalScore.explanation || finalShadowReason} | ${premierQuality.componentText(finalScore)}`
        };
        pos.labPremierDecision = labKarar;
        pos.labLeagueAtOpen = 'DEVELOPMENT';
        pos.premierTrackAtOpen = 'PREMIER_SCORE_SHADOW';
        pos.labProofLevelAtOpen = finalShadowReason;
        pos.leagueShadowOnly = true;
        console.log(`👻 [ST2 PREMIER SCORE SHADOW] ${symbol} ${yon} | ${renkoPremier.patternKey} | ${finalScore.explanation || finalShadowReason} | ${premierQuality.componentText(finalScore)} | Giriş ${renkoPremier.activeBrick.toFixed(2)}`);
    }
    return labKarar;
}

function canliRiskProfili() {
    return realOrderBridge.liveRiskProfile();
}

function hedefNotionalUsdt() {
    return ayarlar.sanalEmirModu
        ? Number(ayarlar.calisilmakIstenenUsdtMiktar || 0) * Number(ayarlar.mevcutKaldirac || 1)
        : Number(canliRiskProfili().notionalUsdt);
}

function aktifGercekPozisyonSayisi() {
    return (h.state.aktifPozisyonlar || []).filter(pos => pos?.sanal === false).length;
}

function canliShadowMaksAktif() {
    const value = Number(ayarlar.canliShadowMaksAktifGozlem || 200);
    return Number.isInteger(value) && value > 0 ? value : 200;
}

function aktifCanliShadowGozlemSayisi() {
    return (h.state.aktifPozisyonlar || []).filter(pos => pos?.liveShadowObservation === true).length;
}

function canliToplamPozisyonKapasitesi() {
    return Math.max(Number(ayarlar.maxPozisyonSayisi || 100), canliShadowMaksAktif() + Math.max(1, Number(canliRiskProfili().maxActivePositions || 1)));
}

async function canliShadowOgrenmeAc({ symbol, yon, canliFiyat, guvenliMiktar, sl, tp, pPrecision, girisAnalizi, hazirKimlik, reason }) {
    if (ayarlar.canliShadowOgrenmeAktif !== true) {
        console.log(`🚫 [CANLI SHADOW KAPALI] ${symbol} ${yon} | ${reason}`);
        return false;
    }
    const active = aktifCanliShadowGozlemSayisi();
    const max = canliShadowMaksAktif();
    if (active >= max) {
        console.log(`🚫 [CANLI SHADOW LİMİTİ] ${symbol} ${yon} | ${active}/${max}`);
        return false;
    }
    const scoreSelectedAtSignal = hazirKimlik?.renkoPremierDecision?.premier === true
        || hazirKimlik?.labPremierDecision?.premierScore?.selected === true;
    const shadowIdentity = {
        ...(hazirKimlik || {}),
        sanal: true,
        liveShadowObservation: true,
        liveShadowReason: reason,
        scoreSelectedAtSignal,
        virtualAccountIncluded: false,
        leagueShadowOnly: true,
        realOrderReadiness: {
            ...(hazirKimlik?.realOrderReadiness || {}),
            allowed: false,
            executionMode: 'LIVE_SHADOW_OBSERVATION',
            reasons: [reason]
        },
        labPremierDecision: {
            ...(hazirKimlik?.labPremierDecision || {}),
            upperLayerIncluded: false,
            virtualShadowOnly: true,
            observationEligible: true,
            realTradingAuthorized: false,
            executionDeferredReason: reason,
            scoreSelectedAtSignal
        }
    };
    console.log(`👻 [CANLI SHADOW ÖĞRENME] ${symbol} ${yon} | Binance emri yok | Neden ${reason} | Aktif ${active + 1}/${max}`);
    return m.sanalPozisyonKaydet(symbol, yon, canliFiyat, guvenliMiktar, sl, tp, pPrecision, girisAnalizi, shadowIdentity);
}

function gercekSembolKuraliGecerli(kural) {
    if (!kural || typeof kural !== 'object') return false;
    const stepSize = Number(kural.stepSize);
    const tickSize = Number(kural.tickSize);
    const minQty = Number(kural.minQty);
    const minNotional = Number(kural.minNotional);
    return Number.isFinite(stepSize) && stepSize > 0
        && Number.isFinite(tickSize) && tickSize > 0
        && Number.isFinite(minQty) && minQty > 0
        && Number.isFinite(minNotional) && minNotional > 0
        && Number.isInteger(Number(kural.quantityPrecision)) && Number(kural.quantityPrecision) >= 0
        && Number.isInteger(Number(kural.pricePrecision)) && Number(kural.pricePrecision) >= 0;
}


const m = {
    pusuSenaryosuTespit: (sonMum, oncekiMum, bollinger, yon) => {
        if (!sonMum || !bollinger || !bollinger.upper.length || !bollinger.lower.length) {
            return { senaryo: null, targetLevel: 0, redSebep: 'Bollinger verisi eksik' };
        }

        const ustBand = bollinger.upper[bollinger.upper.length - 1];
        const altBand = bollinger.lower[bollinger.lower.length - 1];
        const ortaBand = Number(bollinger.mid || 0);
        const yakinlik = (ayarlar.proximityYuzdesi || 0) / 100;
        const govdeYuzde = sonMum.close ? (Math.abs(sonMum.open - sonMum.close) / sonMum.close) * 100 : 0;
        const bandGenisligiYuzde = ortaBand ? ((ustBand - altBand) / ortaBand) * 100 : 0;
        const minBand = ayarlar.minimumBandGenisligiYuzde || 0;
        const minGovde = ayarlar.minimumPusuMumGovdesiYuzde || 0;

        const temelBilgi = {
            altBand,
            ortaBand,
            ustBand,
            govdeYuzde,
            bandGenisligiYuzde
        };

        function kaliteFiltreleriUygunMu(targetLevel) {
            if (minBand > 0 && bandGenisligiYuzde < minBand) {
                return { uygun: false, redSebep: `Bollinger dar: %${bandGenisligiYuzde.toFixed(2)} < %${minBand}` };
            }

            if (minGovde > 0 && govdeYuzde < minGovde) {
                return { uygun: false, redSebep: `Mum gövdesi zayıf: %${govdeYuzde.toFixed(2)} < %${minGovde}` };
            }

            if (ayarlar.pusuOrtaBandFiltresi && ortaBand) {
                const ortaBandUygun = yon === 'LONG' ? targetLevel < ortaBand : targetLevel > ortaBand;
                if (!ortaBandUygun) {
                    return {
                        uygun: false,
                        redSebep: yon === 'LONG'
                            ? `LONG hedefi pusu orta bandının üstünde/eşit: hedef=${targetLevel}, orta=${ortaBand}`
                            : `SHORT hedefi pusu orta bandının altında/eşit: hedef=${targetLevel}, orta=${ortaBand}`
                    };
                }
            }

            return { uygun: true, redSebep: '' };
        }

        if (yon === 'LONG') {
            const kirmiziMum = sonMum.close < sonMum.open;
            const altBandaTemasVeyaYakin = sonMum.low <= altBand * (1 + yakinlik);
            const bandFarkYuzde = ((sonMum.low - altBand) / altBand) * 100;
            if (kirmiziMum && altBandaTemasVeyaYakin) {
                const govdeTepesi = Math.max(sonMum.open, sonMum.close);
                const kalite = kaliteFiltreleriUygunMu(govdeTepesi);
                if (!kalite.uygun) {
                    return { senaryo: null, targetLevel: 0, redSebep: kalite.redSebep, aday: true, ...temelBilgi, bandLevel: altBand, bandFarkYuzde };
                }
                return {
                    senaryo: 'KIRMIZI_MUM_ALT_BAND',
                    targetLevel: govdeTepesi,
                    bandLevel: altBand,
                    bandFarkYuzde,
                    ...temelBilgi
                };
            }
        }

        if (yon === 'SHORT') {
            const yesilMum = sonMum.close > sonMum.open;
            const ustBandaTemasVeyaYakin = sonMum.high >= ustBand * (1 - yakinlik);
            const bandFarkYuzde = ((ustBand - sonMum.high) / ustBand) * 100;
            if (yesilMum && ustBandaTemasVeyaYakin) {
                const govdeDibi = Math.min(sonMum.open, sonMum.close);
                const kalite = kaliteFiltreleriUygunMu(govdeDibi);
                if (!kalite.uygun) {
                    return { senaryo: null, targetLevel: 0, redSebep: kalite.redSebep, aday: true, ...temelBilgi, bandLevel: ustBand, bandFarkYuzde };
                }
                return {
                    senaryo: 'YESIL_MUM_UST_BAND',
                    targetLevel: govdeDibi,
                    bandLevel: ustBand,
                    bandFarkYuzde,
                    ...temelBilgi
                };
            }
        }

        return { senaryo: null, targetLevel: 0 };
    },

    sanalPozisyonKaydet: async (symbol, yon, canliFiyat, guvenliMiktar, sl, tp, pPrecision, girisAnalizi = null, hazirKimlik = null) => {
        const liveShadow = hazirKimlik?.liveShadowObservation === true;
        const manualLockUntil = Number(h.state.manualCloseLocks?.[`${symbol}|${yon}`] || 0);
        if (!liveShadow && manualLockUntil > Date.now()) {
            console.log(`🖐️ [MANUEL KAPANIŞ KİLİDİ] ${symbol} ${yon} | ${new Date(manualLockUntil).toISOString()} tarihine kadar yeniden giriş yok`);
            return false;
        }
        const izin = kaliciHafiza.emirAcilabilirMi(symbol, yon, liveShadow ? { maxPozisyonSayisi: canliToplamPozisyonKapasitesi(), ignoreDailyLimit: true } : {});
        if (!izin.uygun) {
            console.log(`🛡️ [SANAL EMİR ENGELLENDİ] ${symbol} ${yon} | ${izin.sebep}`);
            return false;
        }

        if (girisAnalizi?.entryStrategy === 'ST2_RENKO') {
            const triggeredBrick = Number(girisAnalizi.renkoEntryBrickDistance || 0.75);
            const gate = girisAnalizi.historicalEntryGate || adaptiveDnaEntry.gateDecision({ symbol, sym: symbol, yon, girisAnalizi, ...girisAnalizi }, triggeredBrick);
            const gateBrick = Number(gate.brick);
            if (!Number.isFinite(gateBrick) || Math.abs(gateBrick - triggeredBrick) > 1e-9) {
                console.error(`🚫 [ENTRY_BINDING_ERROR] ${symbol} ${yon} | Tetik ${triggeredBrick}T | Gate ${gateBrick}T | Emir açılmadı`);
                return false;
            }
            girisAnalizi.historicalEntryGate = gate;
            girisAnalizi.renkoEntryBrickDistance = triggeredBrick;
            girisAnalizi.historicalExecutionMode = gate.executionMode;
            girisAnalizi.entryDecisionBinding = {
                ...(girisAnalizi.entryDecisionBinding || {}),
                verified: true,
                selectedBrick: triggeredBrick,
                gateBrick,
                verifiedAt: new Date().toISOString()
            };
            if (gate.allow) {
                console.log(`✅ [ST2 PREMIER SCORE GATE] ${symbol} ${yon} | PREMIER | ${gate.reason} | Skor ${Number(gate.premierScore?.score||0).toFixed(1)}/${Number(gate.premierScore?.threshold||0).toFixed(1)} | Sıra #${Number(gate.premierScore?.rank||0)}/${Number(gate.premierScore?.cohortSize||0)} | Giriş ${gate.brick.toFixed(2)}`);
            } else {
                console.log(`👻 [ST2 PREMIER SCORE GATE] ${symbol} ${yon} | SHADOW | ${gate.action} | ${gate.reason} | Skor ${Number(gate.premierScore?.score||0).toFixed(1)}/${Number(gate.premierScore?.threshold||0).toFixed(1)} | Sıra #${Number(gate.premierScore?.rank||0)}/${Number(gate.premierScore?.cohortSize||0)} | Giriş ${gate.brick.toFixed(2)}`);
            }
        }

        const sanalId = `SANAL-${Date.now()}-${h.state.sanalEmirSayaci++}`;

        const yeniPozisyon = {
            sym: symbol,
            yon,
            girisFiyati: canliFiyat,
            sl,
            ilkSl: sl,
            tp,
            miktar: guvenliMiktar,
            pozisyonDegeri: guvenliMiktar * canliFiyat,
            sanal: true,
            sanalOrderId: sanalId,
            acilisZamani: Date.now(),
            mevcutTpYuzdesi: 0,
            tpKademe: 0,
            sonTpSeviyesi: tp,
            breakevenAktif: false,
            labLifecycleProfile: hazirKimlik?.labLifecycleProfile || null,
            labBeTetikYuzde: hazirKimlik?.labLifecycleProfile?.beTriggerPct,
            labBeTamponYuzde: hazirKimlik?.labLifecycleProfile?.beBufferPct,
            girisAnalizi
        };
        // v5.0.6: Eksiksiz Identity -> League -> Exit zinciri state kaydından ÖNCE kopyalanır.
        // Snapshot/kimlik eksikse anonim pozisyon hiçbir zaman aktif state'e giremez.
        identityChain.copyPrepared(yeniPozisyon, hazirKimlik);
        identityChain.assertPrepared(yeniPozisyon);
        const renkoExitAtamasi = renkoExitEvolution.assign(yeniPozisyon);
        if (girisAnalizi?.entryStrategy === 'ST2_RENKO' && !(Number(renkoExitAtamasi?.assignedTrailBricks) > 0)) {
            console.error(`🚫 [RENKO_EXIT_ASSIGN_ERROR] ${symbol} ${yon} | Geçerli tuğla takip mesafesi atanamadı`);
            return false;
        }
        if (liveShadow) {
            yeniPozisyon.liveShadowObservation = true;
            yeniPozisyon.liveShadowReason = hazirKimlik?.liveShadowReason || 'LIVE_SHADOW';
            yeniPozisyon.scoreSelectedAtSignal = hazirKimlik?.scoreSelectedAtSignal === true;
            yeniPozisyon.leagueShadowOnly = true;
            yeniPozisyon.virtualAccountIncluded = false;
        }

        h.state.aktifPozisyonlar.push(yeniPozisyon);
        if (yon === 'LONG') h.state.alinanlar.push(symbol);
        else h.state.aktifShortlar.push(symbol);
        kaliciHafiza.kaydet('sanal-pozisyon-temel-kayit');

        try { exitOptimizer.pozisyonBaslat(yeniPozisyon); } catch (e) { console.log(`⚠️ [ENTRY AUX] EXIT_INIT_ERROR ${symbol} ${yon} | ${e.message}`); }
        const karar = yeniPozisyon.realOrderReadiness;
        // Önceden dondurulan LAB kararı yeniden uygulanır; yeni karar/kimlik üretilmez.
        let labKarar = labPremier.applyToPosition(yeniPozisyon, yeniPozisyon.labPremierDecision);
        // Kalibre edilmiş ST2 Premier kararı sanal ve gerçek yol için tek fonksiyonda dondurulur.
        labKarar = st2PremierScoreBagla(yeniPozisyon, girisAnalizi, symbol, yon);
        if (liveShadow) {
            labKarar = {
                ...(labKarar || {}), upperLayerIncluded: false, virtualShadowOnly: true,
                observationEligible: true, realTradingAuthorized: false,
                executionDeferredReason: hazirKimlik?.liveShadowReason || 'LIVE_SHADOW',
                scoreSelectedAtSignal: hazirKimlik?.scoreSelectedAtSignal === true
            };
            yeniPozisyon.labPremierDecision = labKarar;
            yeniPozisyon.leagueShadowOnly = true;
            yeniPozisyon.virtualAccountIncluded = false;
            yeniPozisyon.liveShadowObservation = true;
        }
        console.log(`[LAB LİG KAPISI] ${labKarar?.upperLayerIncluded ? '🏆 [LAB PREMIER SANAL İŞLEM]' : '👻 [LAB GÖLGE ÖĞRENME]'} ${symbol} ${yon} | ${labKarar?.labDnaLabel || 'LAB #YOK'} | Family ${labKarar?.familyDnaLabel || 'DNA #YOK'} | Lig ${labKarar?.labLeague || 'DEVELOPMENT'} | Exit ${labKarar?.exit?.algorithmLabel || karar.exit?.label || 'Mevcut Kademe Sistemi'}`);
        // Eski Family Premier gözlemi yeni pozisyonlarda üst katman değildir; yalnız açık eski pozisyonların kapanış uyumu korunur.
        try { if (ayarlar.familyLeagueEmirYetkisiAktif === true) premierObservation.snapshot(yeniPozisyon); } catch (e) { console.log(`⚠️ [ENTRY AUX] PREMIER_OBSERVATION_ERROR ${symbol} ${yon} | ${e.message}`); }
        try { labChampion.snapshot(yeniPozisyon); } catch (e) { console.log(`⚠️ [ENTRY AUX] LAB_CHAMPION_ERROR ${symbol} ${yon} | ${e.message}`); }
        try { labPremier.snapshot(yeniPozisyon); } catch (e) { console.log(`⚠️ [ENTRY AUX] LAB_SNAPSHOT_ERROR ${symbol} ${yon} | ${e.message}`); }
        try { accountingContinuity.trackAtOpen(yeniPozisyon); } catch (e) { console.log(`⚠️ [ENTRY AUX] ACCOUNTING_CONTINUITY_OPEN_ERROR ${symbol} ${yon} | ${e.message}`); }
        // v6.10.9: Renko kâr takip ataması identity zincirinden sonra ve state'e girmeden önce tek kez donduruldu.
        // Tek sanal pozisyon, iki ayrı kayıt amacı taşır:
        // 1) tüm DNA/exit öğrenme motorları, 2) açılışta dondurulan lig test kasası.
        // Aynı sinyal için ikinci bir pozisyon veya ikinci emir oluşturulmaz.
        yeniPozisyon.dualLayerAudit = {
            singlePosition: true,
            learningLayer: true,
            leaguePerformanceLayer: Boolean(yeniPozisyon.labPremierObservation),
            leagueTrack: yeniPozisyon.labPremierDecision?.upperLayerIncluded ? 'LAB_PREMIER' : 'LAB_SHADOW',
            authority: 'LAB_DNA',
            markedAt: new Date().toISOString()
        };
        try { exitMethodScoreboard.open(yeniPozisyon); } catch (e) { console.log(`⚠️ [ENTRY AUX] EXIT_SCOREBOARD_ERROR ${symbol} ${yon} | ${e.message}`); }
        try { analizMerkezi.acilisKaydet(yeniPozisyon); } catch (e) { console.log(`⚠️ [ENTRY AUX] INTELLIGENCE_SAVE_ERROR ${symbol} ${yon} | ${e.message}`); }
        const blackboxKaydi = blackbox.kayitYaz(yeniPozisyon, 'ACILIS', { sonuc: 'ACIK' });
        if (!blackboxKaydi?.ok) {
            console.log(`⚠️ [IDENTITY CHAIN] BLACKBOX aşaması tamamlanamadı: ${symbol} ${yon} | ${blackboxKaydi?.error || 'BILINMEYEN'}`);
        } else {
            identityChain.markStage(yeniPozisyon, 'BLACKBOX');
        }

        if (!yeniPozisyon.leagueShadowOnly) {
            h.state.basariOzeti.toplamAcilanEmir = (h.state.basariOzeti.toplamAcilanEmir || 0) + 1;
            kaliciHafiza.yeniEmirSay();
        }
        kaliciHafiza.kaydet('sanal-pozisyon-acildi');

        const analizSatiri = girisAnalizi
            ? ` | TF: Trend ${girisAnalizi.trendPeriyodu || 'YOK'} / Pusu ${girisAnalizi.pusuPeriyodu} / Sniper ${girisAnalizi.sniperPeriyodu} | Tetik: ${Number(girisAnalizi.tetikFiyati || 0).toFixed(pPrecision)} | Sapma: %${Number(girisAnalizi.tetikSapmaYuzde || 0).toFixed(4)} | Kırılım→Emir: ${girisAnalizi.kirilimdanEmreMs ?? 'YOK'} ms | ST→Emir: ${girisAnalizi.trenddenEmreMs ?? 'YOK'} ms | ST: ${girisAnalizi.superTrendYonu || 'YOK'} (${girisAnalizi.stKaynak || 'YOK'})`
            : '';
        console.log(`🧪 [SANAL POZİSYON AÇILDI] ${symbol} ${yon} | Giriş: ${canliFiyat.toFixed(pPrecision)} | Miktar: ${guvenliMiktar} | SL: ${sl.toFixed(pPrecision)} | TP: ${tp.toFixed(pPrecision)} | ID: ${sanalId}${analizSatiri}`);

        const analizMesaji = girisAnalizi
            ? `\n\n📊 <b>Giriş Teşhisi</b>\n` +
              `🕒 Trend TF: ${girisAnalizi.trendPeriyodu || 'YOK'} | Pusu TF: ${girisAnalizi.pusuPeriyodu} | Sniper TF: ${girisAnalizi.sniperPeriyodu}\n` +
              `🎯 Hedef: ${Number(girisAnalizi.hedefFiyati || 0).toFixed(pPrecision)}\n` +
              `🚦 Tetik: ${Number(girisAnalizi.tetikFiyati || 0).toFixed(pPrecision)}\n` +
              `🧩 Tetik Modu: ${girisAnalizi.tetikModu || 'YOK'}\n` +
              `📍 Giriş-Tetik Sapması: %${Number(girisAnalizi.tetikSapmaYuzde || 0).toFixed(4)}\n` +
              (girisAnalizi.emirSnapshot ? `🧊 RAW Canlı: ${Number(girisAnalizi.emirSnapshot.canliFiyatRaw || 0).toPrecision(12)} | RAW Tetik: ${Number(girisAnalizi.emirSnapshot.tetikRaw || 0).toPrecision(12)} | Compare: ${girisAnalizi.emirSnapshot.compareText} = ${girisAnalizi.emirSnapshot.compareResult ? 'TRUE ✅' : 'FALSE ❌'}\n` : '') +
              (girisAnalizi.emirSnapshot ? `🚧 Geç Giriş: ${girisAnalizi.emirSnapshot.gecGirisUygun ? 'UYGUN ✅' : 'GEÇ KALMIŞ ❌'} | Max Sapma: %${Number(girisAnalizi.emirSnapshot.maxGirisSapmaYuzde || 0).toFixed(2)}\n` : '') +
              `📈 ST(${girisAnalizi.trendPeriyodu || 'YOK'}): ${girisAnalizi.superTrendYonu || 'YOK'} (${girisAnalizi.stKaynak || 'YOK'})${girisAnalizi.superTrendEtki ? ` | Etki: ${girisAnalizi.superTrendEtki.puan}/20 | Yaş: ${girisAnalizi.superTrendEtki.yasMum} | Mesafe: %${Number(girisAnalizi.superTrendEtki.mesafeYuzde || 0).toFixed(2)}` : ''}\n` +
              `⏱️ Kırılım→Emir: ${girisAnalizi.kirilimdanEmreMs ?? 'YOK'} ms\n` +
              `⏱️ ST→Emir: ${girisAnalizi.trenddenEmreMs ?? 'YOK'} ms\n` +
              `🧭 Sıra: ${girisAnalizi.tetikSirasi || 'YOK'}\n` +
              `📌 Senaryo: ${girisAnalizi.senaryo || 'YOK'} | Sayaç: ${girisAnalizi.pusuSayaci || 0}/${girisAnalizi.maxPusuBeklemeMum ?? 0}` +
              (girisAnalizi.pusuDebug ? `\n\n${girisAnalizi.pusuDebug}` : '') +
              (girisAnalizi.sniperDebug ? `\n\n${girisAnalizi.sniperDebug}` : '')
            : '';

        const shadowTelegramAllowed = !liveShadow || ayarlar.canliShadowTelegramAcilisMesaji === true;
        const telegramGonderildi = ayarlar.telegramIslemAcilisMesaji === true && shadowTelegramAllowed ? await h.telegramMesajGonder(
            operationTransparency.openingText(yeniPozisyon, { real: false, pricePrecision: pPrecision })
        ).then(() => true).catch(err => {
            console.log(`⚠️ [ENTRY AUX] TELEGRAM_ERROR ${symbol} ${yon} | ${err.message}`);
            return false;
        }) : false;
        if (telegramGonderildi && yeniPozisyon.identityChainAudit?.completed?.includes('BLACKBOX')) {
            identityChain.markStage(yeniPozisyon, 'TELEGRAM');
        }

        kaliciHafiza.kaydet('sanal-pozisyon-zenginlestirildi');
        console.log(`✅ [ENTRY_SUCCESS] ${symbol} ${yon} | ${sanalId}`);
        return true;
    },

    pozisyonAc: async (symbol, yon, canliFiyat, girisAnalizi = null) => {
        try {
            const manualLockUntil = Number(h.state.manualCloseLocks?.[`${symbol}|${yon}`] || 0);
            const manualRealLock = !ayarlar.sanalEmirModu && manualLockUntil > Date.now();
            if (ayarlar.sanalEmirModu && manualLockUntil > Date.now()) {
                console.log(`🖐️ [MANUEL KAPANIŞ KİLİDİ] ${symbol} ${yon} | ${new Date(manualLockUntil).toISOString()} tarihine kadar yeniden giriş yok`);
                return false;
            }
            // Canlı modda gerçek risk slotu, kimlik/score üretiminden önce öğrenmeyi kesmez.
            // Toplam bellek kapasitesi ayrı; gerçek 1/1 limiti yalnız Binance emrinden hemen önce uygulanır.
            const izin = kaliciHafiza.emirAcilabilirMi(symbol, yon, !ayarlar.sanalEmirModu
                ? { maxPozisyonSayisi: canliToplamPozisyonKapasitesi(), ignoreDailyLimit: true }
                : {});
            if (!izin.uygun) {
                console.log(`🛡️ [EMİR ENGELLENDİ] ${symbol} ${yon} | ${izin.sebep}`);
                console.log(`⛔ [ENTRY_ABORT:${String(izin.sebep || 'EMIR_GATE').replace(/[^A-Z0-9_:-]/gi, '_').toUpperCase()}] ${symbol} ${yon}`);
                return false;
            }

            const kural = h.state.basamaklar[symbol] || {};
            if (!ayarlar.sanalEmirModu && !gercekSembolKuraliGecerli(kural)) {
                console.log(`🚫 [GERÇEK SEMBOL KURALI FAIL-CLOSED] ${symbol} ${yon} | step/tick/minQty/minNotional/precision eksik veya geçersiz`);
                return false;
            }
            const toplamDolar = hedefNotionalUsdt();
            const hamMiktar = toplamDolar / canliFiyat;
            const guvenliMiktar = miktarKlip(symbol, hamMiktar);
            const minQty = kural.minQty || 0;
            const minNotional = kural.minNotional || 5;
            const notional = guvenliMiktar * canliFiyat;
            const stepSize = kural.stepSize || Math.pow(10, -(kural.quantityPrecision ?? 2));
            const auditAyarlar = ayarlar.sanalEmirModu ? ayarlar : (() => {
                const risk = canliRiskProfili();
                return {
                    ...ayarlar,
                    mevcutKaldirac: risk.leverage,
                    calisilmakIstenenUsdtMiktar: risk.notionalUsdt / risk.leverage
                };
            })();
            const audit = positionSizingAudit.auditHesapla({
                symbol,
                yon,
                canliFiyat,
                ayarlar: auditAyarlar,
                kural: { ...kural, minQty, minNotional },
                hamMiktar,
                guvenliMiktar,
                stepSize
            });

            if (!guvenliMiktar || guvenliMiktar <= 0 || guvenliMiktar < minQty || notional < minNotional) {
                if (miktarKapasiteEngeliVar(audit)) {
                    miktarKapasiteEngeliniIsaretle(symbol, yon, audit);
                }
                miktarRedLoglaVePusuyuTemizle(symbol, yon, audit);
                console.log(`⛔ [ENTRY_ABORT:INVALID_POSITION_SIZE] ${symbol} ${yon}`);
                return false;
            }

            const pPrecision = kural.pricePrecision ?? 4;
            const slOrani = (ayarlar.sabitStopYuzdesi || 1.5) / 100;
            const tpYuzdesi = ayarlar.stopTakipModu === 'KADEME' ? (ayarlar.maxTpYuzdesi || 10) : (ayarlar.sabitTpYuzdesi || 0.4);
            const tpOrani = tpYuzdesi / 100;
            let sl = fiyatKlip(symbol, yon === 'LONG' ? canliFiyat * (1 - slOrani) : canliFiyat * (1 + slOrani));
            let tp = fiyatKlip(symbol, yon === 'LONG' ? canliFiyat * (1 + tpOrani) : canliFiyat * (1 - tpOrani));

            // Sanal ve gerçek emir aynı DNA + rejim + exit kimliğini kullanır; lig yalnız gerçek emir kapısında engeldir.
            const etkinEntryStrategy = girisAnalizi?.entryStrategy
                || (ayarlar.entryStrategyMode === 'ST2_RENKO' ? 'ST2_RENKO' : 'ST1');
            const etkinGirisAnalizi = {
                ...(girisAnalizi || {}),
                entryStrategy: etkinEntryStrategy
            };
            const hazirKimlik = {
                sym: symbol, yon, girisFiyati: canliFiyat, sl, tp, miktar: guvenliMiktar,
                sanal: ayarlar.sanalEmirModu, acilisZamani: Date.now(),
                entryStrategy: etkinEntryStrategy, girisAnalizi: etkinGirisAnalizi
            };
            try {
                await identityChain.prepare(hazirKimlik, { realMode: !ayarlar.sanalEmirModu });
            } catch (err) {
                console.log(`⛔ [ENTRY_ABORT:IDENTITY_CHAIN] ${symbol} ${yon} | ${err.code || 'IDENTITY_CHAIN_ERROR'} | ${err.message}`);
                return false;
            }
            const yasamProfili = labLifecycle.apply(hazirKimlik);
            const etkinStopYuzdesi = Number(yasamProfili?.stopPct || ayarlar.sabitStopYuzdesi || 1.5);
            const etkinStopOrani = etkinStopYuzdesi / 100;
            sl = fiyatKlip(symbol, String(hazirKimlik.yon || yon).toUpperCase() === 'LONG' ? canliFiyat * (1 - etkinStopOrani) : canliFiyat * (1 + etkinStopOrani));
            hazirKimlik.sl = sl;
            hazirKimlik.labLifecycleProfile = yasamProfili;
            const islemYonu = String(hazirKimlik.yon || yon).toUpperCase();
            if (islemYonu !== yon) {
                sl = fiyatKlip(symbol, islemYonu === 'LONG' ? canliFiyat * (1 - etkinStopOrani) : canliFiyat * (1 + etkinStopOrani));
                tp = fiyatKlip(symbol, islemYonu === 'LONG' ? canliFiyat * (1 + tpOrani) : canliFiyat * (1 - tpOrani));
                hazirKimlik.sl = sl;
                hazirKimlik.tp = tp;
                hazirKimlik.girisAnalizi = { ...(hazirKimlik.girisAnalizi || {}), originalSignalSide: yon, reverseExecutionSide: islemYonu };
                console.log(`🔁 [TERS PREMIER YÖNÜ] ${symbol} ${yon} sinyali → ${islemYonu} sanal yürütme | ${hazirKimlik.labPremierDecision?.sourceLabDnaLabel || 'LAB #YOK'} → ${hazirKimlik.labPremierDecision?.labDnaLabel || 'LAB #YOK'}`);
            }
            let labGercekKarar = ayarlar.sanalEmirModu ? null : hazirKimlik.labPremierDecision;
            if (!ayarlar.sanalEmirModu) {
                labGercekKarar = st2PremierScoreBagla(hazirKimlik, hazirKimlik.girisAnalizi || etkinGirisAnalizi, symbol, islemYonu);
                const canliKarar = realOrderBridge.evaluate(hazirKimlik, { realMode: true, scoreDecision: labGercekKarar?.premierScore || null });
                labGercekKarar.realTradingAuthorized = Boolean(canliKarar.allowed && labGercekKarar?.upperLayerIncluded === true);
                labPremier.applyToPosition(hazirKimlik, labGercekKarar);
            }
            const ortakKarar = hazirKimlik.realOrderReadiness;

            if (ayarlar.sanalEmirModu) {
                console.log(`🧪 [SANAL EMİR MODU] Binance'e emir gönderilmeyecek: ${symbol} ${islemYonu}`);
                const kimlikAnalizi = hazirKimlik.girisAnalizi || girisAnalizi || {};
                const etkinAnaliz = islemYonu === yon ? kimlikAnalizi : { ...kimlikAnalizi, originalSignalSide: yon, reverseExecutionSide: islemYonu };
                return await m.sanalPozisyonKaydet(symbol, islemYonu, canliFiyat, guvenliMiktar, sl, tp, pPrecision, etkinAnaliz, hazirKimlik);
            }

            if (!ortakKarar.allowed || !labGercekKarar?.realTradingAuthorized) {
                const nedenler = [
                    ...(ortakKarar.allowed ? [] : ortakKarar.reasons),
                    ...(!labGercekKarar?.realTradingAuthorized ? ['LAB_PREMIER_GERCEK_EMIR_YETKISI_KAPALI'] : [])
                ];
                const reason = nedenler.join('|') || 'REAL_ENTRY_NOT_AUTHORIZED';
                premierObservation.blocked(ortakKarar.key, reason, { symbol, side: yon });
                return canliShadowOgrenmeAc({
                    symbol, yon: islemYonu, canliFiyat, guvenliMiktar, sl, tp, pPrecision,
                    girisAnalizi: hazirKimlik.girisAnalizi || etkinGirisAnalizi, hazirKimlik, reason
                });
            }

            if (manualRealLock) {
                return canliShadowOgrenmeAc({
                    symbol, yon: islemYonu, canliFiyat, guvenliMiktar, sl, tp, pPrecision,
                    girisAnalizi: hazirKimlik.girisAnalizi || etkinGirisAnalizi, hazirKimlik,
                    reason: `MANUAL_CLOSE_SYMBOL_LOCK:${new Date(manualLockUntil).toISOString()}`
                });
            }

            // R18 CONTROL PLANE FAIL-CLOSED: Renko/pusu taraması ağ veya signed mutabakat
            // gecikse bile devam eder; ancak gerçek Binance emri yalnız taze control-plane kanıtıyla açılır.
            if (ayarlar.entryStrategyMode === 'ST2_RENKO') {
                const safety = h.state.st2RealEntrySafety || {};
                if (safety.ready !== true) {
                    return canliShadowOgrenmeAc({
                        symbol, yon: islemYonu, canliFiyat, guvenliMiktar, sl, tp, pPrecision,
                        girisAnalizi: hazirKimlik.girisAnalizi || etkinGirisAnalizi, hazirKimlik,
                        reason: `ST2_CONTROL_PLANE_FAIL_CLOSED:${safety.reason || 'NOT_READY'}`
                    });
                }
            }

            const realDailyGate = kaliciHafiza.emirAcilabilirMi(symbol, islemYonu, {
                maxPozisyonSayisi: canliToplamPozisyonKapasitesi(),
                ignoreDailyLimit: false
            });
            if (!realDailyGate.uygun) {
                return canliShadowOgrenmeAc({
                    symbol, yon: islemYonu, canliFiyat, guvenliMiktar, sl, tp, pPrecision,
                    girisAnalizi: hazirKimlik.girisAnalizi || etkinGirisAnalizi, hazirKimlik,
                    reason: `REAL_DAILY_OR_CAPACITY_GATE:${realDailyGate.sebep}`
                });
            }

            const ligBoyutCarpani = Math.max(0.01, Math.min(1, Number(ortakKarar.sizeMultiplier || 1)));
            const risk = canliRiskProfili();
            if (!(risk.notionalUsdt > 0)
                || !(Number.isInteger(risk.leverage) && risk.leverage >= 1 && risk.leverage <= 125)
                || !['ISOLATED', 'CROSSED'].includes(risk.marginType)
                || !(Number.isInteger(risk.maxActivePositions) && risk.maxActivePositions >= 0)) {
                return canliShadowOgrenmeAc({
                    symbol, yon: islemYonu, canliFiyat, guvenliMiktar, sl, tp, pPrecision,
                    girisAnalizi: hazirKimlik.girisAnalizi || etkinGirisAnalizi, hazirKimlik,
                    reason: 'GERCEK_RISK_AYARI_FAIL_CLOSED'
                });
            }
            if (risk.maxActivePositions === 0 || aktifGercekPozisyonSayisi() >= risk.maxActivePositions) {
                return canliShadowOgrenmeAc({
                    symbol, yon: islemYonu, canliFiyat, guvenliMiktar, sl, tp, pPrecision,
                    girisAnalizi: hazirKimlik.girisAnalizi || etkinGirisAnalizi, hazirKimlik,
                    reason: `GERCEK_POZISYON_SLOTU_DOLU:${aktifGercekPozisyonSayisi()}/${risk.maxActivePositions}`
                });
            }
            let hedefGercekNotional = risk.notionalUsdt * ligBoyutCarpani;
            let gercekMiktar = gercekMiktarHedefeEnYakinKlip(symbol, hedefGercekNotional / canliFiyat);
            let gercekNotional = gercekMiktar * canliFiyat;
            const onEmirSapmaYuzde = hedefGercekNotional > 0 ? Math.abs((gercekNotional - hedefGercekNotional) / hedefGercekNotional) * 100 : 999;
            const maksNotionalSapmaYuzde = Number(ayarlar.gercekEmirMaksNotionalSapmaYuzde);
            if (!Number.isFinite(maksNotionalSapmaYuzde) || maksNotionalSapmaYuzde < 0 ||
                !gercekMiktar || gercekMiktar < minQty || gercekNotional < minNotional || onEmirSapmaYuzde > maksNotionalSapmaYuzde) {
                return canliShadowOgrenmeAc({
                    symbol, yon: islemYonu, canliFiyat, guvenliMiktar, sl, tp, pPrecision,
                    girisAnalizi: hazirKimlik.girisAnalizi || etkinGirisAnalizi, hazirKimlik,
                    reason: `GERCEK_BOYUT_FAIL_CLOSED:${onEmirSapmaYuzde.toFixed(3)}`
                });
            }

            const reservation = await realExecution.reserveEntry({
                symbol, side: islemYonu, context: hazirKimlik,
                client: h.client
            });
            if (!reservation.ok) {
                console.log(`🚫 [GERÇEK EMİR KALICI KİLİT/PREFLIGHT] ${symbol} ${islemYonu} | ${reservation.reason}`);
                const shadowEligible = /GLOBAL_BLOCK|AKTIF_POZISYON_LIMITI|YETKISI_YOK|YENI_GIRIS_DURDURULDU/.test(String(reservation.reason || ''));
                if (shadowEligible) {
                    return canliShadowOgrenmeAc({
                        symbol, yon: islemYonu, canliFiyat, guvenliMiktar, sl, tp, pPrecision,
                        girisAnalizi: hazirKimlik.girisAnalizi || etkinGirisAnalizi, hazirKimlik,
                        reason: `REAL_PREFLIGHT:${reservation.reason}`
                    });
                }
                return false;
            }

            let kaldirac = risk.leverage;
            const marjinTipi = risk.marginType;
            let fill = null;
            let protections = null;
            try {
                console.log(`⚙️ [BINANCE API] ${symbol} ${islemYonu} ${ortakKarar.realTier} onaylı | ${risk.marginUsdt.toFixed(2)} USDT marjin x ${kaldirac} = ${hedefGercekNotional.toFixed(2)} USDT notional | ${marjinTipi} | idempotent Market + Algo Service koruması hazırlanıyor...`);
                await h.client.futuresMarginType({ symbol, marginType: marjinTipi }).catch(err => {
                    const text = String(err?.message || err || '');
                    if (!text.includes('-4046') && !/no need to change margin type/i.test(text)) throw err;
                });
                const leverageDecision = await symbolLeveragePolicy.negotiate({
                    symbol, requestedLeverage: kaldirac, client: h.client
                });
                kaldirac = leverageDecision.effective;
                if (kaldirac !== risk.leverage) {
                    hedefGercekNotional = risk.marginUsdt * kaldirac * ligBoyutCarpani;
                    gercekMiktar = miktarKlip(symbol, hedefGercekNotional / canliFiyat);
                    gercekNotional = gercekMiktar * canliFiyat;
                    const fallbackSapma = hedefGercekNotional > 0
                        ? Math.abs((gercekNotional - hedefGercekNotional) / hedefGercekNotional) * 100
                        : 999;
                    if (!gercekMiktar || gercekMiktar < minQty || gercekNotional < minNotional || fallbackSapma > maksNotionalSapmaYuzde) {
                        throw new Error(`KALDIRAC_FALLBACK_BOYUT_FAIL_CLOSED:${kaldirac}x:${fallbackSapma.toFixed(3)}`);
                    }
                    console.warn(`⚠️ [SEMBOL KALDIRAÇ UYUMU] ${symbol} | İstenen ${risk.leverage}x reddedildi | Etkin ${kaldirac}x | Marjin ${risk.marginUsdt.toFixed(2)} USDT | Notional ${hedefGercekNotional.toFixed(2)} USDT`);
                }

                console.log(`📤 [GERÇEK EMİR GÖNDERİLİYOR] ${symbol} ${islemYonu} ${gercekMiktar} @ MARKET | Client ${reservation.ids.entry}`);
                fill = await realExecution.executeEntry({
                    reservation, quantity: gercekMiktar, referencePrice: canliFiyat,
                    minQty, minNotional, maxNotionalDeviationPct: maksNotionalSapmaYuzde,
                    client: h.client
                });

                const gerceklesenMiktar = miktarKlip(symbol, fill.actualQty);
                const gerceklesenFiyat = Number(fill.avgPrice);
                const gerceklesenNotional = gerceklesenMiktar * gerceklesenFiyat;
                const notionalSapmaYuzde = hedefGercekNotional > 0 ? ((gerceklesenNotional - hedefGercekNotional) / hedefGercekNotional) * 100 : 0;
                const slippageYuzde = canliFiyat > 0
                    ? (islemYonu === 'LONG' ? ((gerceklesenFiyat - canliFiyat) / canliFiyat) : ((canliFiyat - gerceklesenFiyat) / canliFiyat)) * 100
                    : 0;
                console.log(`📥 [GERÇEK FILL MUTABAKATI] ${symbol} | Order ${fill.order?.orderId || 'AMBIGUOUS_RECOVERED'} | Qty ${gerceklesenMiktar} | Fill ${gerceklesenFiyat} | Notional ${gerceklesenNotional.toFixed(4)} | Sapma ${notionalSapmaYuzde.toFixed(3)}% | Slippage ${slippageYuzde.toFixed(4)}%`);

                sl = fiyatKlip(symbol, islemYonu === 'LONG' ? gerceklesenFiyat * (1 - etkinStopOrani) : gerceklesenFiyat * (1 + etkinStopOrani));
                tp = fiyatKlip(symbol, islemYonu === 'LONG' ? gerceklesenFiyat * (1 + tpOrani) : gerceklesenFiyat * (1 - tpOrani));
                hazirKimlik.girisFiyati = gerceklesenFiyat;
                hazirKimlik.miktar = gerceklesenMiktar;
                hazirKimlik.sl = sl;
                hazirKimlik.tp = tp;

                console.log(`📤 [ALGO KORUMA] ${symbol} | SL ${sl.toFixed(pPrecision)} | TP ${tp.toFixed(pPrecision)}`);
                protections = await realExecution.installProtections({
                    reservation, side: islemYonu,
                    stopPrice: sl.toFixed(pPrecision), takeProfitPrice: tp.toFixed(pPrecision),
                    client: h.client
                });
                console.log(`✅ [GERÇEK ALGO KORUMA HAZIR] ${symbol} | SL Algo ${protections.stop?.algoId || protections.stop?.clientAlgoId} | TP Algo ${protections.takeProfit?.algoId || protections.takeProfit?.clientAlgoId}`);
            } catch (executionError) {
                console.error(`🚨 [GERÇEK AÇILIŞ ZİNCİRİ HATASI] ${symbol} ${islemYonu} | ${executionError.message}`);
                // Hata kaldıraç/marjin aşamasında da, emir cevabı belirsizken de oluşabilir.
                // Kör varsayım yapılmaz: aynı kalıcı kimlikle Binance pozisyonu sorgulanır;
                // pozisyon varsa reduce-only kapatılır, yoksa rezervasyon güvenli terminale alınır.
                const rollback = await realExecution.rollbackEntry({
                    reservation, side: islemYonu, reason: executionError.message, client: h.client
                }).catch(err => ({ ok: false, reason: err.message }));
                const globalBlock = realExecution.readState().globalBlock;
                const yeniEmirDurumu = globalBlock
                    ? `GLOBAL BLOCK (${globalBlock.reason || 'NEDEN_YOK'})`
                    : 'BLOK YOK (FILL/PROTECTION HATASI OLMAYABİLİR)';
                await h.telegramMesajGonder(
                    `🚨 GERÇEK EMİR FAIL-CLOSED\n${symbol} ${islemYonu}\nHata: ${executionError.message}\nRollback/Mutabakat: ${rollback.ok ? 'DOĞRULANDI' : 'BAŞARISIZ'}\nYeni Gerçek Emirler: ${yeniEmirDurumu}`
                ).catch(() => {});
                return false;
            }

            const gerceklesenMiktar = miktarKlip(symbol, fill.actualQty);
            const gerceklesenFiyat = Number(fill.avgPrice);
            const gerceklesenNotional = gerceklesenMiktar * gerceklesenFiyat;
            const notionalSapmaYuzde = hedefGercekNotional > 0 ? ((gerceklesenNotional - hedefGercekNotional) / hedefGercekNotional) * 100 : 0;
            const slippageYuzde = canliFiyat > 0
                ? (islemYonu === 'LONG' ? ((gerceklesenFiyat - canliFiyat) / canliFiyat) : ((canliFiyat - gerceklesenFiyat) / canliFiyat)) * 100
                : 0;

            const yeniPozisyon = {
                sym: symbol,
                yon: islemYonu,
                girisFiyati: gerceklesenFiyat,
                sl,
                tp,
                miktar: gerceklesenMiktar,
                hedefNotionalUsdt: Number(hedefGercekNotional.toFixed(6)),
                gerceklesenNotionalUsdt: Number(gerceklesenNotional.toFixed(6)),
                notionalSapmaYuzde: Number(notionalSapmaYuzde.toFixed(6)),
                kaldirac,
                marjinTipi,
                slippageYuzde: Number(slippageYuzde.toFixed(6)),
                girisEmriCevabi: {
                    orderId: fill.order?.orderId || null,
                    clientOrderId: reservation.ids.entry,
                    status: fill.order?.status || (fill.ambiguityRecovered ? 'AMBIGUOUS_RECOVERED' : null),
                    executedQty: gerceklesenMiktar,
                    avgPrice: gerceklesenFiyat
                },
                korumaEmirleri: {
                    slAlgoId: protections.stop?.algoId || null,
                    slClientAlgoId: protections.stop?.clientAlgoId || reservation.ids.stop,
                    tpAlgoId: protections.takeProfit?.algoId || null,
                    tpClientAlgoId: protections.takeProfit?.clientAlgoId || reservation.ids.takeProfit
                },
                ligBoyutCarpani,
                gercekLig: ortakKarar.realTier,
                sanal: false,
                borsaOrderId: fill.order?.orderId || null,
                acilisZamani: Date.now(),
                mevcutTpYuzdesi: 0,
                tpKademe: 0,
                sonTpSeviyesi: tp,
                breakevenAktif: false,
                labLifecycleProfile: hazirKimlik?.labLifecycleProfile || null,
                labBeTetikYuzde: hazirKimlik?.labLifecycleProfile?.beTriggerPct,
                labBeTamponYuzde: hazirKimlik?.labLifecycleProfile?.beBufferPct,
                girisAnalizi: hazirKimlik.girisAnalizi || girisAnalizi
            };
            identityChain.copyPrepared(yeniPozisyon, hazirKimlik);
            identityChain.assertPrepared(yeniPozisyon);
            const gercekRenkoExitAtamasi = renkoExitEvolution.assign(yeniPozisyon);
            if (!(Number(gercekRenkoExitAtamasi?.assignedTrailBricks) > 0)) {
                // Giriş ve Binance SL/TP zaten kuruludur; güvenli varsayılan tuğla atamasıyla devam edilir.
                yeniPozisyon.renkoExitAssignment = {
                    ...(gercekRenkoExitAtamasi || {}),
                    assignedTrailBricks: Number(ayarlar.renkoCikisVarsayilanTugla || 1),
                    liveExitMode: 'SAFE_COMMISSION_BRICK_TRAIL',
                    trailSource: 'SAFE_DEFAULT_BRICK_TRAIL',
                    assignmentRepairReason: 'POST_FILL_ASSIGNMENT_REPAIRED'
                };
                console.error(`⚠️ [RENKO_EXIT_ASSIGN_REPAIR] ${symbol} ${islemYonu} | Güvenli varsayılan ${yeniPozisyon.renkoExitAssignment.assignedTrailBricks}T`);
            }
            premierObservation.snapshot(yeniPozisyon);
            labPremier.snapshot(yeniPozisyon);
            yeniPozisyon.dualLayerAudit = {
                singlePosition: true,
                learningLayer: true,
                leaguePerformanceLayer: Boolean(yeniPozisyon.premierObservation),
                leagueTrack: yeniPozisyon.premierObservation?.learningTrack || 'SHADOW',
                markedAt: new Date().toISOString()
            };
            exitMethodScoreboard.open(yeniPozisyon);
            realExecution.markOpen(reservation, yeniPozisyon, protections, {
                entryOrder: fill.order, ambiguityRecovered: fill.ambiguityRecovered
            });

            h.state.aktifPozisyonlar.push(yeniPozisyon);
            try { accountingContinuity.trackAtOpen(yeniPozisyon); } catch (e) { console.log(`⚠️ [ENTRY AUX] ACCOUNTING_CONTINUITY_OPEN_ERROR ${symbol} ${yon} | ${e.message}`); }
            analizMerkezi.acilisKaydet(yeniPozisyon);
            const gercekBlackboxKaydi = blackbox.kayitYaz(yeniPozisyon, 'ACILIS', { sonuc: 'ACIK' });
            if (gercekBlackboxKaydi?.ok) identityChain.markStage(yeniPozisyon, 'BLACKBOX');
            else console.log(`⚠️ [IDENTITY CHAIN] BLACKBOX aşaması tamamlanamadı: ${symbol} ${yon} | ${gercekBlackboxKaydi?.error || 'BILINMEYEN'}`);

            if (islemYonu === 'LONG') h.state.alinanlar.push(symbol);
            else h.state.aktifShortlar.push(symbol);
            h.state.basariOzeti.toplamAcilanEmir = (h.state.basariOzeti.toplamAcilanEmir || 0) + 1;
            kaliciHafiza.yeniEmirSay();

            const gercekTelegramGonderildi = ayarlar.telegramIslemAcilisMesaji === true ? await h.telegramMesajGonder(
                operationTransparency.openingText(yeniPozisyon, { real: true, pricePrecision: pPrecision })
            ).then(() => true).catch(err => {
                console.log(`⚠️ [ENTRY AUX] TELEGRAM_ERROR ${symbol} ${yon} | ${err.message}`);
                return false;
            }) : false;
            if (gercekTelegramGonderildi && yeniPozisyon.identityChainAudit?.completed?.includes('BLACKBOX')) {
                identityChain.markStage(yeniPozisyon, 'TELEGRAM');
            }

            console.log(`✅ [TELEGRAM] ${symbol} için mesaj gönderildi.`);
            return true;
        } catch (e) {
            console.error(`❌ [API HATASI] ${symbol}:`, e.message || e);
            console.log(`⛔ [ENTRY_ABORT:UNKNOWN] ${symbol} ${yon} | ${e.message || e}`);
            if (e.response) console.error('📄 [YANIT]', JSON.stringify(e.response.data || {}, null, 2));
            return false;
        }
    },

    pozisyonKapat: async (symbol, yon) => {
        try {
            const pos = h.state.aktifPozisyonlar.find(x => x.sym === symbol && x.yon === yon);
            if (ayarlar.sanalEmirModu || pos?.sanal) {
                console.log(`🧪 [SANAL KAPATMA] ${symbol} ${yon} için Binance'e kapatma emri gönderilmedi.`);
                return true;
            }

            const sonuc = await realExecution.closePositionMarket(pos || { sym: symbol, yon, sanal: false }, 'TRADE_ENGINE_CLOSE', h.client);
            if (sonuc.ok) {
                if (pos) pos.realizedExecution = sonuc;
                console.log(`✅ [GERÇEK KAPATMA MUTABAKATI] ${symbol} ${yon} | ${sonuc.exitPrice || 'FILL_BEKLENMEDI'} | Net ${Number(sonuc.netPnl || 0).toFixed(6)}`);
                return true;
            }
            console.error(`🚨 [GERÇEK KAPATMA BAŞARISIZ] ${symbol} ${yon} | ${sonuc.reason}`);
            return false;
        } catch (e) {
            console.error(`❌ [BINANCE API KAPATMA HATASI] ${symbol}:`, e.message || e);
            return false;
        }
    },

    hesaplaBollinger: (fiyatDizisi) => {
        if (!fiyatDizisi || fiyatDizisi.length < ayarlar.bollingerperiod) return { mid: 0, upper: [], lower: [] };
        const son = fiyatDizisi.slice(-ayarlar.bollingerperiod);
        const mid = son.reduce((a, b) => a + b, 0) / ayarlar.bollingerperiod;
        const varyans = son.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / ayarlar.bollingerperiod;
        const sapma = Math.sqrt(varyans);
        return {
            mid,
            upper: [mid + ((ayarlar.bollingercarpani || 2) * sapma)],
            lower: [mid - ((ayarlar.bollingercarpani || 2) * sapma)]
        };
    },

    hesaplaSuperTrend: (mumlar, period = ayarlar.superTrendPeriod || 10, multiplier = ayarlar.superTrendMultiplier || 3) => {
        if (!mumlar || mumlar.length < period + 2) return { trend: null, value: 0 };

        const tr = [];
        for (let i = 0; i < mumlar.length; i++) {
            if (i === 0) tr.push(mumlar[i].high - mumlar[i].low);
            else {
                tr.push(Math.max(
                    mumlar[i].high - mumlar[i].low,
                    Math.abs(mumlar[i].high - mumlar[i - 1].close),
                    Math.abs(mumlar[i].low - mumlar[i - 1].close)
                ));
            }
        }

        const atr = new Array(mumlar.length).fill(null);
        let toplam = 0;
        for (let i = 0; i < period; i++) toplam += tr[i];
        atr[period - 1] = toplam / period;
        for (let i = period; i < mumlar.length; i++) {
            atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
        }

        const finalUpper = new Array(mumlar.length).fill(null);
        const finalLower = new Array(mumlar.length).fill(null);
        const superTrend = new Array(mumlar.length).fill(null);
        let trend = 'UP';

        for (let i = period; i < mumlar.length; i++) {
            const hl2 = (mumlar[i].high + mumlar[i].low) / 2;
            const basicUpper = hl2 + multiplier * atr[i];
            const basicLower = hl2 - multiplier * atr[i];

            if (i === period) {
                finalUpper[i] = basicUpper;
                finalLower[i] = basicLower;
                trend = mumlar[i].close >= basicLower ? 'UP' : 'DOWN';
                superTrend[i] = trend === 'UP' ? finalLower[i] : finalUpper[i];
                continue;
            }

            finalUpper[i] = (basicUpper < finalUpper[i - 1] || mumlar[i - 1].close > finalUpper[i - 1]) ? basicUpper : finalUpper[i - 1];
            finalLower[i] = (basicLower > finalLower[i - 1] || mumlar[i - 1].close < finalLower[i - 1]) ? basicLower : finalLower[i - 1];

            if (superTrend[i - 1] === finalUpper[i - 1]) {
                trend = mumlar[i].close <= finalUpper[i] ? 'DOWN' : 'UP';
            } else {
                trend = mumlar[i].close >= finalLower[i] ? 'UP' : 'DOWN';
            }

            superTrend[i] = trend === 'UP' ? finalLower[i] : finalUpper[i];
        }

        const sonIndex = mumlar.length - 1;
        return { trend, value: superTrend[sonIndex] || 0 };
    },

    miktarKlip,
    gercekMiktarHedefeEnYakinKlip,
    fiyatKlip
};

module.exports = m;
