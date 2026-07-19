const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');
const analizMerkezi = require('./7_analiz_merkezi.js');
const blackbox = require('./8_blackbox.js');
const exitOptimizer = require('./15_exit_optimizer_foundation.js');
const positionSizingAudit = require('./19_position_sizing_audit.js');
const dnaExitSelector = require('./43_dna_exit_selector.js');
const dnaLeague = require('./46_dna_league_engine.js');
const premierObservation = require('./48_premier_observation_engine.js');
const exitMethodScoreboard = require('./52_exit_method_scoreboard.js');
const realOrderBridge = require('./50_real_order_readiness_bridge.js');

function ondalikSayisi(step) {
    const s = String(step);
    if (!s.includes('.')) return 0;
    return s.replace(/0+$/, '').split('.')[1]?.length || 0;
}

function miktarKlip(sym, miktar) {
    const kural = h.state.basamaklar[sym];
    if (!kural) return Number(miktar.toFixed(2));
    const step = kural.stepSize || Math.pow(10, -kural.quantityPrecision);
    const precision = ondalikSayisi(step);
    const duzeltilmis = Math.floor(miktar / step) * step;
    return Number(duzeltilmis.toFixed(precision));
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
    positionSizingAudit.logla(h.state, {
        symbol,
        yon,
        sebep: detay.sebep || 'MIKTAR_RED',
        fiyat: detay.canliFiyat,
        marjin: ayarlar.calisilmakIstenenUsdtMiktar,
        kaldirac: ayarlar.mevcutKaldirac,
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
    const kural = h.state.basamaklar[sym];
    if (!kural) return Number(fiyat.toFixed(4));
    const tick = kural.tickSize || Math.pow(10, -kural.pricePrecision);
    const precision = ondalikSayisi(tick);
    const duzeltilmis = Math.round(fiyat / tick) * tick;
    return Number(duzeltilmis.toFixed(precision));
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
        const izin = kaliciHafiza.emirAcilabilirMi(symbol, yon);
        if (!izin.uygun) {
            console.log(`🛡️ [SANAL EMİR ENGELLENDİ] ${symbol} ${yon} | ${izin.sebep}`);
            return false;
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
            girisAnalizi
        };
        // Ortak kimlik sanal/gerçek emirden önce hazırlanır; burada aynı snapshot yeniden kullanılabilir.
        yeniPozisyon.blackboxAcilis = hazirKimlik?.blackboxAcilis || await blackbox.snapshotAl(symbol, yon, 'ACILIS').catch(err => {
            console.log(`⚠️ [BLACKBOX] Açılış snapshot alınamadı: ${symbol} ${yon} | ${err.message}`);
            return null;
        });

        exitOptimizer.pozisyonBaslat(yeniPozisyon);
        if (hazirKimlik) {
            realOrderBridge.copyDecisionToPosition(yeniPozisyon, hazirKimlik);
        }
        const karar = hazirKimlik?.realOrderReadiness || realOrderBridge.evaluate(yeniPozisyon, { realMode: false });
        yeniPozisyon.leagueShadowOnly = Boolean(karar.virtualShadowOnly);
        yeniPozisyon.virtualAccountIncluded = !yeniPozisyon.leagueShadowOnly;
        console.log(`[ALT ÖĞRENME KAPISI AÇIK] ${yeniPozisyon.leagueShadowOnly ? '👻 [WORST-10 GÖLGE İŞLEM]' : '🧪 [SANAL KASA İŞLEMİ]'} ${symbol} ${yon} | DNA ${karar.key} | Lig ${karar.league} | Exit ${karar.exit?.label || 'Mevcut Kademe Sistemi'}`);
        premierObservation.snapshot(yeniPozisyon);
        // Tek sanal pozisyon, iki ayrı kayıt amacı taşır:
        // 1) tüm DNA/exit öğrenme motorları, 2) açılışta dondurulan lig test kasası.
        // Aynı sinyal için ikinci bir pozisyon veya ikinci emir oluşturulmaz.
        yeniPozisyon.dualLayerAudit = {
            singlePosition: true,
            learningLayer: true,
            leaguePerformanceLayer: Boolean(yeniPozisyon.premierObservation),
            leagueTrack: yeniPozisyon.premierObservation?.learningTrack || 'SHADOW',
            markedAt: new Date().toISOString()
        };
        exitMethodScoreboard.open(yeniPozisyon);
        h.state.aktifPozisyonlar.push(yeniPozisyon);
        analizMerkezi.acilisKaydet(yeniPozisyon);
        blackbox.kayitYaz(yeniPozisyon, 'ACILIS', { sonuc: 'ACIK' });

        if (yon === 'LONG') h.state.alinanlar.push(symbol);
        else h.state.aktifShortlar.push(symbol);
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

        await h.telegramMesajGonder(
            `${yeniPozisyon.leagueShadowOnly ? '👻 <b>[WORST-10 GÖLGE POZİSYON]</b>' : '🧪 <b>[SANAL POZİSYON AÇILDI]</b>'}\n` +
            (yeniPozisyon.premierObservation?.qualifiedAtOpen ? `💎 <b>${yeniPozisyon.premierObservation.leagueAtOpen} LİG İŞLEMİ</b> | Lig Skoru ${Number(yeniPozisyon.premierObservation.leagueScore||0).toFixed(1)}\n` : `🌱 Alt Lig / Öğrenme İşlemi\n`) +
            `🔀 ${symbol} (${yon})\n` +
            `🪪 ${yeniPozisyon.realOrderReadiness?.dnaLabel || yeniPozisyon.dnaLabel || 'DNA #YOK'}\n` +
            `🧬 DNA: ${yeniPozisyon.realOrderReadiness?.key || 'YOK'}\n` +
            `🏆 Lig: ${yeniPozisyon.realOrderReadiness?.league || 'UNRANKED'} | Eşleşme: ${yeniPozisyon.realOrderReadiness?.leagueMatchType || 'NONE'}\n` +
            `🎯 Atanan Exit: ${yeniPozisyon.executionExitAssignment?.label || 'Mevcut Kademe Sistemi'}${yeniPozisyon.executionExitAssignment?.activeForPosition ? ' (AKTİF)' : ' (KADEME FALLBACK)'}\n` +
            `📊 Exit Kanıtı: N${Number(yeniPozisyon.executionExitAssignment?.samples || 0)} | Beat %${Number(yeniPozisyon.executionExitAssignment?.beatRate || 0).toFixed(1)} | PF ${Number(yeniPozisyon.executionExitAssignment?.profitFactor || 0).toFixed(2)} | Net ${Number(yeniPozisyon.executionExitAssignment?.netUsdt || 0).toFixed(4)}\n` +
            `🧭 Seçim Kapsamı: ${yeniPozisyon.executionExitAssignment?.scope || 'ACTUAL_FALLBACK'}\n` +
            `🔎 Seçim Sebebi: ${yeniPozisyon.executionExitAssignment?.reason || 'Güvenli kademe fallback'}\n` +
            `🔐 Plan Kimliği: ${yeniPozisyon.executionExitAssignment?.assignmentId || 'YOK'}\n` +
            `💰 Giriş: ${canliFiyat.toFixed(pPrecision)}\n` +
            `📦 Miktar: ${guvenliMiktar}\n` +
            `🛡️ Sanal SL: ${sl.toFixed(pPrecision)}\n` +
            `🎯 Sanal Final TP: ${tp.toFixed(pPrecision)}\n` +
            `🆔 ${sanalId}\n` +
            `🕒 İşlem Açılış: ${blackbox.tarihSaat(yeniPozisyon.acilisZamani)}` +
            blackbox.telegramSnapshotMetni(yeniPozisyon.blackboxAcilis, 'BLACKBOX AÇILIŞ FOTOĞRAFI') +
            analizMesaji
        );

        return true;
    },

    pozisyonAc: async (symbol, yon, canliFiyat, girisAnalizi = null) => {
        try {
            const izin = kaliciHafiza.emirAcilabilirMi(symbol, yon);
            if (!izin.uygun) {
                console.log(`🛡️ [EMİR ENGELLENDİ] ${symbol} ${yon} | ${izin.sebep}`);
                return false;
            }

            const kural = h.state.basamaklar[symbol] || {};
            const toplamDolar = ayarlar.calisilmakIstenenUsdtMiktar * ayarlar.mevcutKaldirac;
            const hamMiktar = toplamDolar / canliFiyat;
            const guvenliMiktar = miktarKlip(symbol, hamMiktar);
            const minQty = kural.minQty || 0;
            const minNotional = kural.minNotional || 5;
            const notional = guvenliMiktar * canliFiyat;
            const stepSize = kural.stepSize || Math.pow(10, -(kural.quantityPrecision ?? 2));
            const audit = positionSizingAudit.auditHesapla({
                symbol,
                yon,
                canliFiyat,
                ayarlar,
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
                return false;
            }

            const pPrecision = kural.pricePrecision ?? 4;
            const slOrani = (ayarlar.sabitStopYuzdesi || 1.5) / 100;
            const tpYuzdesi = ayarlar.stopTakipModu === 'KADEME' ? (ayarlar.maxTpYuzdesi || 10) : (ayarlar.sabitTpYuzdesi || 0.4);
            const tpOrani = tpYuzdesi / 100;
            const sl = fiyatKlip(symbol, yon === 'LONG' ? canliFiyat * (1 - slOrani) : canliFiyat * (1 + slOrani));
            const tp = fiyatKlip(symbol, yon === 'LONG' ? canliFiyat * (1 + tpOrani) : canliFiyat * (1 - tpOrani));

            // Sanal ve gerçek emir aynı DNA + rejim + exit kimliğini kullanır; lig yalnız gerçek emir kapısında engeldir.
            const hazirKimlik = {
                sym: symbol, yon, girisFiyati: canliFiyat, sl, tp, miktar: guvenliMiktar,
                sanal: ayarlar.sanalEmirModu, acilisZamani: Date.now(), girisAnalizi
            };
            hazirKimlik.blackboxAcilis = await blackbox.snapshotAl(symbol, yon, 'ACILIS').catch(err => {
                console.log(`⚠️ [BLACKBOX] Emir öncesi snapshot alınamadı: ${symbol} ${yon} | ${err.message}`);
                return null;
            });
            const ortakKarar = realOrderBridge.evaluate(hazirKimlik, { realMode: !ayarlar.sanalEmirModu });

            if (ayarlar.sanalEmirModu) {
                console.log(`🧪 [SANAL EMİR MODU] Binance'e emir gönderilmeyecek: ${symbol} ${yon}`);
                return await m.sanalPozisyonKaydet(symbol, yon, canliFiyat, guvenliMiktar, sl, tp, pPrecision, girisAnalizi, hazirKimlik);
            }

            if (!ortakKarar.allowed) {
                premierObservation.blocked(ortakKarar.key, ortakKarar.reasons.join('|'), { symbol, side: yon });
                console.log(`🚫 [GERÇEK EMİR FAIL-CLOSED] ${symbol} ${yon} | ${ortakKarar.reasons.join(', ')}`);
                await h.telegramMesajGonder(realOrderBridge.telegramText(ortakKarar));
                return false;
            }

            const ligBoyutCarpani = Math.max(0.01, Math.min(1, Number(ortakKarar.sizeMultiplier || 1)));
            const gercekMiktar = miktarKlip(symbol, guvenliMiktar * ligBoyutCarpani);
            const gercekNotional = gercekMiktar * canliFiyat;
            if (!gercekMiktar || gercekMiktar < minQty || gercekNotional < minNotional) {
                console.log(`🚫 [LİG BOYUTU MİNİMUM ALTINDA] ${symbol} ${yon} | Lig ${ortakKarar.realTier} | Çarpan x${ligBoyutCarpani.toFixed(2)} | Notional ${gercekNotional.toFixed(4)} < ${minNotional}`);
                return false;
            }

            console.log(`⚙️ [BINANCE API] ${symbol} ${yon} ${ortakKarar.realTier} onaylı | Boyut x${ligBoyutCarpani.toFixed(2)} | Market + Koruma Emirleri Hazırlanıyor...`);

            await h.client.futuresLeverage({ symbol, leverage: ayarlar.mevcutKaldirac });
            await h.client.futuresMarginType({ symbol, marginType: 'CROSSED' }).catch(() => {});

            const emirYonu = yon === 'LONG' ? 'BUY' : 'SELL';
            const karsiYon = yon === 'LONG' ? 'SELL' : 'BUY';

            console.log(`📤 [EMİR GÖNDERİLİYOR] ${symbol} ${emirYonu} ${gercekMiktar} @ Market | ${ortakKarar.realTier} x${ligBoyutCarpani.toFixed(2)}`);

            const sonuc = await h.client.futuresOrder({
                symbol,
                side: emirYonu,
                type: 'MARKET',
                quantity: gercekMiktar.toString()
            });

            console.log(`📥 [EMİR CEVABI] ${symbol} Order ID: ${sonuc?.orderId || 'YOK'}`);

            if (!sonuc || !sonuc.orderId) return false;

            console.log(`📤 [SL GÖNDERİLİYOR] ${symbol} STOP_MARKET @ ${sl.toFixed(pPrecision)}`);
            const slSonuc = await h.client.futuresOrder({
                symbol,
                side: karsiYon,
                type: 'STOP_MARKET',
                stopPrice: sl.toFixed(pPrecision),
                closePosition: true,
                workingType: 'MARK_PRICE'
            }).catch(e => {
                console.error(`❌ [SL EMRİ HATASI] ${symbol}:`, e.message || e);
                return null;
            });

            if (slSonuc?.orderId) console.log(`✅ [SL BAŞARILI] ${symbol} Order ID: ${slSonuc.orderId}`);
            else console.log(`⚠️ [SL BAŞARISIZ] ${symbol} Stop emri gönderilemedi!`);

            console.log(`📤 [TP GÖNDERİLİYOR] ${symbol} TAKE_PROFIT_MARKET @ ${tp.toFixed(pPrecision)}`);
            const tpSonuc = await h.client.futuresOrder({
                symbol,
                side: karsiYon,
                type: 'TAKE_PROFIT_MARKET',
                stopPrice: tp.toFixed(pPrecision),
                closePosition: true,
                workingType: 'MARK_PRICE'
            }).catch(e => {
                console.error(`❌ [TP EMRİ HATASI] ${symbol}:`, e.message || e);
                return null;
            });

            if (tpSonuc?.orderId) console.log(`✅ [TP BAŞARILI] ${symbol} Order ID: ${tpSonuc.orderId}`);
            else console.log(`⚠️ [TP BAŞARISIZ] ${symbol} TP emri gönderilemedi!`);

            const yeniPozisyon = {
                sym: symbol,
                yon,
                girisFiyati: canliFiyat,
                sl,
                tp,
                miktar: gercekMiktar,
                ligBoyutCarpani,
                gercekLig: ortakKarar.realTier,
                sanal: false,
                borsaOrderId: sonuc.orderId,
                acilisZamani: Date.now(),
                mevcutTpYuzdesi: 0,
                tpKademe: 0,
                sonTpSeviyesi: tp,
                breakevenAktif: false,
                girisAnalizi
            };
            yeniPozisyon.blackboxAcilis = hazirKimlik.blackboxAcilis;
            realOrderBridge.copyDecisionToPosition(yeniPozisyon, hazirKimlik);
            premierObservation.snapshot(yeniPozisyon);
            yeniPozisyon.dualLayerAudit = {
                singlePosition: true,
                learningLayer: true,
                leaguePerformanceLayer: Boolean(yeniPozisyon.premierObservation),
                leagueTrack: yeniPozisyon.premierObservation?.learningTrack || 'SHADOW',
                markedAt: new Date().toISOString()
            };
            exitMethodScoreboard.open(yeniPozisyon);

            h.state.aktifPozisyonlar.push(yeniPozisyon);
            analizMerkezi.acilisKaydet(yeniPozisyon);
            blackbox.kayitYaz(yeniPozisyon, 'ACILIS', { sonuc: 'ACIK' });

            if (yon === 'LONG') h.state.alinanlar.push(symbol);
            else h.state.aktifShortlar.push(symbol);
            h.state.basariOzeti.toplamAcilanEmir = (h.state.basariOzeti.toplamAcilanEmir || 0) + 1;
            kaliciHafiza.yeniEmirSay();

            await h.telegramMesajGonder(
                `🚀 <b>[POZİSYON AÇILDI]</b>\n` +
                `🔀 ${symbol} (${yon})\n` +
                `💰 Giriş: ${canliFiyat.toFixed(pPrecision)}\n` +
                `📦 Miktar: ${guvenliMiktar}\n` +
                `🛡️ Borsaya İletilen SL: ${sl.toFixed(pPrecision)}\n` +
                `🎯 Borsaya İletilen Final TP: ${tp.toFixed(pPrecision)}` +
                realOrderBridge.telegramText(yeniPozisyon.realOrderReadiness) +
                dnaExitSelector.openingText(yeniPozisyon.exitPlanShadow) +
              blackbox.telegramSnapshotMetni(yeniPozisyon.blackboxAcilis, 'BLACKBOX AÇILIŞ FOTOĞRAFI') +
                (girisAnalizi?.superTrendEtki ? `\n📈 ST Etki: ${girisAnalizi.superTrendEtki.puan}/20 | Yaş: ${girisAnalizi.superTrendEtki.yasMum} | Mesafe: %${Number(girisAnalizi.superTrendEtki.mesafeYuzde || 0).toFixed(2)} | ${girisAnalizi.superTrendEtki.durum}` : '')
            );

            console.log(`✅ [TELEGRAM] ${symbol} için mesaj gönderildi.`);
            return true;
        } catch (e) {
            console.error(`❌ [API HATASI] ${symbol}:`, e.message || e);
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

            await h.client.futuresLeverage({ symbol, leverage: ayarlar.mevcutKaldirac });
            const kapatmaYonu = yon === 'LONG' ? 'SELL' : 'BUY';
            const pozisyonlar = await h.client.futuresPositionRisk();
            const hedef = pozisyonlar.find(p => p.symbol === symbol);
            if (!hedef || parseFloat(hedef.positionAmt) === 0) return true;

            const mutlakMiktar = Math.abs(parseFloat(hedef.positionAmt));
            const guvenliKapatmaMiktari = miktarKlip(symbol, mutlakMiktar);
            const sonuc = await h.client.futuresOrder({
                symbol,
                side: kapatmaYonu,
                type: 'MARKET',
                quantity: guvenliKapatmaMiktari.toString(),
                reduceOnly: true
            });

            if (sonuc?.orderId) {
                console.log(`✅ [KAPATILDI] ${symbol} ${yon} pozisyonu kapatıldı!`);
                return true;
            }
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
    fiyatKlip
};

module.exports = m;
