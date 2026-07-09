const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');
const analizMerkezi = require('./7_analiz_merkezi.js');
const blackbox = require('./8_blackbox.js');
const exitOptimizer = require('./15_exit_optimizer_foundation.js');

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

    sanalPozisyonKaydet: async (symbol, yon, canliFiyat, guvenliMiktar, sl, tp, pPrecision, girisAnalizi = null) => {
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
        // BlackBox açılış fotoğrafı: stratejiye müdahale etmez, sadece analiz verisi üretir.
        yeniPozisyon.blackboxAcilis = await blackbox.snapshotAl(symbol, yon, 'ACILIS').catch(err => {
            console.log(`⚠️ [BLACKBOX] Açılış snapshot alınamadı: ${symbol} ${yon} | ${err.message}`);
            return null;
        });

        exitOptimizer.pozisyonBaslat(yeniPozisyon);
        h.state.aktifPozisyonlar.push(yeniPozisyon);
        analizMerkezi.acilisKaydet(yeniPozisyon);
        blackbox.kayitYaz(yeniPozisyon, 'ACILIS', { sonuc: 'ACIK' });

        if (yon === 'LONG') h.state.alinanlar.push(symbol);
        else h.state.aktifShortlar.push(symbol);
        h.state.basariOzeti.toplamAcilanEmir = (h.state.basariOzeti.toplamAcilanEmir || 0) + 1;
        kaliciHafiza.yeniEmirSay();
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
            `🧪 <b>[SANAL POZİSYON AÇILDI]</b>\n` +
            `🔀 ${symbol} (${yon})\n` +
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

            if (!guvenliMiktar || guvenliMiktar <= 0 || guvenliMiktar < minQty || notional < minNotional) {
                console.error(`❌ [MİKTAR HATASI] ${symbol} miktar=${guvenliMiktar}, notional=${notional.toFixed(4)}, minQty=${minQty}, minNotional=${minNotional}`);
                return false;
            }

            const pPrecision = kural.pricePrecision ?? 4;
            const slOrani = (ayarlar.sabitStopYuzdesi || 1.5) / 100;
            const tpYuzdesi = ayarlar.stopTakipModu === 'KADEME' ? (ayarlar.maxTpYuzdesi || 10) : (ayarlar.sabitTpYuzdesi || 0.4);
            const tpOrani = tpYuzdesi / 100;
            const sl = fiyatKlip(symbol, yon === 'LONG' ? canliFiyat * (1 - slOrani) : canliFiyat * (1 + slOrani));
            const tp = fiyatKlip(symbol, yon === 'LONG' ? canliFiyat * (1 + tpOrani) : canliFiyat * (1 - tpOrani));

            if (ayarlar.sanalEmirModu) {
                console.log(`🧪 [SANAL EMİR MODU] Binance'e emir gönderilmeyecek: ${symbol} ${yon}`);
                return await m.sanalPozisyonKaydet(symbol, yon, canliFiyat, guvenliMiktar, sl, tp, pPrecision, girisAnalizi);
            }

            console.log(`⚙️ [BINANCE API] ${symbol} ${yon} Market + Koruma Emirleri Hazırlanıyor...`);

            await h.client.futuresLeverage({ symbol, leverage: ayarlar.mevcutKaldirac });
            await h.client.futuresMarginType({ symbol, marginType: 'CROSSED' }).catch(() => {});

            const emirYonu = yon === 'LONG' ? 'BUY' : 'SELL';
            const karsiYon = yon === 'LONG' ? 'SELL' : 'BUY';

            console.log(`📤 [EMİR GÖNDERİLİYOR] ${symbol} ${emirYonu} ${guvenliMiktar} @ Market`);

            const sonuc = await h.client.futuresOrder({
                symbol,
                side: emirYonu,
                type: 'MARKET',
                quantity: guvenliMiktar.toString()
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
                miktar: guvenliMiktar,
                sanal: false,
                borsaOrderId: sonuc.orderId,
                acilisZamani: Date.now(),
                mevcutTpYuzdesi: 0,
                tpKademe: 0,
                sonTpSeviyesi: tp,
                breakevenAktif: false,
                girisAnalizi
            };
            yeniPozisyon.blackboxAcilis = await blackbox.snapshotAl(symbol, yon, 'ACILIS').catch(err => {
                console.log(`⚠️ [BLACKBOX] Açılış snapshot alınamadı: ${symbol} ${yon} | ${err.message}`);
                return null;
            });

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
