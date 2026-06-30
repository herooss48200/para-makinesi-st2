const h = require('./1_hafiza.js');
const m = require('./motor.js');
const ayarlar = require('./ayarlar.js');
const rapor = require('./2_rapor.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');

let pusuRaporu = [];
let sonRaporZamani = 0;
const RAPOR_ARALIGI = 300000;

function dinamikBasamak(sym, deger, tip = 'fiyat') {
    const kural = h.state.basamaklar[sym];
    if (!kural) return Number(deger).toFixed(4);
    const hassasiyet = tip === 'fiyat' ? kural.pricePrecision : kural.quantityPrecision;
    return Number(deger).toFixed(hassasiyet);
}

function durumLogla(sym, mesaj, zorla = false) {
    const now = Date.now();
    const eski = h.state.sonDurumLoglari[sym] || { zaman: 0, mesaj: '' };
    const aralik = ayarlar.durumLogAraligiMs || 5000;
    if (zorla || eski.mesaj !== mesaj || now - eski.zaman >= aralik) {
        console.log(mesaj);
        h.state.sonDurumLoglari[sym] = { zaman: now, mesaj };
    }
}

function kaliteIsareti(uygun) {
    return uygun ? '✅' : '❌';
}

function pusuKaliteMetni(pusu) {
    const bandGen = Number(pusu.bandGenisligiYuzde || 0);
    const govde = Number(pusu.govdeYuzde || 0);
    const orta = Number(pusu.ortaBand || 0);
    const hedef = Number(pusu.targetLevel || 0);
    const minBand = ayarlar.minimumBandGenisligiYuzde || 0;
    const minGovde = ayarlar.minimumPusuMumGovdesiYuzde || 0;
    const bandUygun = minBand <= 0 || bandGen >= minBand;
    const govdeUygun = minGovde <= 0 || govde >= minGovde;
    const ortaUygun = !ayarlar.pusuOrtaBandFiltresi || !orta || (pusu.yon === 'LONG' ? hedef < orta : hedef > orta);

    return `PusuKalite: BandGenişliği %${bandGen.toFixed(2)} ${kaliteIsareti(bandUygun)} | Gövde %${govde.toFixed(2)} ${kaliteIsareti(govdeUygun)} | ${ayarlar.pusuPeriyodu} OrtaBand ${orta ? dinamikBasamak(pusu.sym || '', orta) : 'YOK'} ${kaliteIsareti(ortaUygun)}`;
}

function periyotMs(periyot) {
    const yazi = String(periyot || '5m').trim();
    const sayi = parseInt(yazi, 10);
    if (!Number.isFinite(sayi) || sayi <= 0) return 300000;
    if (yazi.endsWith('m')) return sayi * 60 * 1000;
    if (yazi.endsWith('h')) return sayi * 60 * 60 * 1000;
    if (yazi.endsWith('d')) return sayi * 24 * 60 * 60 * 1000;
    return sayi * 60 * 1000;
}

function pusuSayaclariniGuncelle() {
    const anaPeriyotMs = periyotMs(ayarlar.pusuPeriyodu || '5m');
    const maxBekleme = ayarlar.maxPusuBeklemeMum ?? 3;

    for (const [sym, pusu] of Object.entries(h.state.pusuListesi)) {
        const mumlar = h.state.yerelPusuHafizasi[sym];
        if (!mumlar || mumlar.length === 0) continue;

        const sonMum = mumlar[mumlar.length - 1];
        if (!sonMum.closeTime || !pusu.olusanMumZamani) continue;

        const gecenMumSayisi = Math.max(0, Math.floor((sonMum.closeTime - pusu.olusanMumZamani) / anaPeriyotMs));

        if (gecenMumSayisi !== (pusu.gecenMumSayisi || 0)) {
            pusu.gecenMumSayisi = gecenMumSayisi;
            pusu.sonSayacMumZamani = sonMum.closeTime;
            console.log(`⏱️ [PUSU SAYACI] ${sym} ${pusu.yon} | ${pusu.gecenMumSayisi}/${maxBekleme} kapanmış ${ayarlar.pusuPeriyodu} mum geçti.`);
        }

        if (gecenMumSayisi >= maxBekleme) {
            console.log(`⏰ [PUSU İPTAL] ${sym} ${pusu.yon} | ${maxBekleme} kapanmış ${ayarlar.pusuPeriyodu} mum geçti, hedef zamanında kırılmadı.`);
            delete h.state.pusuListesi[sym];
        }
    }
}

async function piyasayiTaraVePusuKur() {
    pusuSayaclariniGuncelle();

    const now = Date.now();
    for (const sym of h.state.semboller) {
        if (h.state.pusuListesi[sym]) continue;
        if (h.state.alinanlar.includes(sym) || h.state.aktifShortlar.includes(sym)) continue;

        const pusuMumlari = h.state.yerelPusuHafizasi[sym];
        if (!pusuMumlari || pusuMumlari.length < ayarlar.bollingerperiod) continue;

        const sonMum = pusuMumlari[pusuMumlari.length - 1];
        const oncekiMum = pusuMumlari[pusuMumlari.length - 2];

        if (!sonMum || !sonMum.closeTime) continue;

        const sonPusuAnahtari = `${sonMum.closeTime}`;
        const kontrolAnahtari = `${sym}_${sonPusuAnahtari}`;
        if (h.state.sonDurumLoglari[`pusuKontrol_${kontrolAnahtari}`]) continue;

        const fiyatlar = pusuMumlari.map(x => x.close);
        const bollinger = m.hesaplaBollinger(fiyatlar);

        const longSenaryo = m.pusuSenaryosuTespit(sonMum, oncekiMum, bollinger, 'LONG');
        if (!longSenaryo.senaryo && longSenaryo.aday && longSenaryo.redSebep) {
            console.log(`🚫 [PUSU RED] ${sym} LONG | ${longSenaryo.redSebep} | Band genişliği: %${Number(longSenaryo.bandGenisligiYuzde || 0).toFixed(2)} | Gövde: %${Number(longSenaryo.govdeYuzde || 0).toFixed(2)} | Mum: ${new Date(sonMum.closeTime).toLocaleString()}`);
        }

        if (longSenaryo.senaryo) {
            h.state.pusuListesi[sym] = {
                sym,
                yon: 'LONG',
                targetLevel: longSenaryo.targetLevel,
                gecenMumSayisi: 0,
                sonSayacMumZamani: sonMum.closeTime,
                olusanMumZamani: sonMum.closeTime,
                senaryo: longSenaryo.senaryo,
                bandLevel: longSenaryo.bandLevel,
                bandFarkYuzde: longSenaryo.bandFarkYuzde,
                altBand: longSenaryo.altBand,
                ortaBand: longSenaryo.ortaBand,
                ustBand: longSenaryo.ustBand,
                bandGenisligiYuzde: longSenaryo.bandGenisligiYuzde,
                govdeYuzde: longSenaryo.govdeYuzde,
                olusumZamani: now,
                kirilimGordu: false,
                kirilimZamani: 0,
                kirilimFiyati: 0,
                trendOnayiGordu: false,
                trendOnayiZamani: 0
            };
            pusuRaporu.push({ sym, yon: 'LONG', senaryo: longSenaryo.senaryo, bandFarkYuzde: longSenaryo.bandFarkYuzde });
            console.log(`🔔 [YENİ PUSU] ${sym} LONG | Hedef: ${dinamikBasamak(sym, longSenaryo.targetLevel)} | AltBand: ${dinamikBasamak(sym, longSenaryo.bandLevel)} | OrtaBand: ${dinamikBasamak(sym, longSenaryo.ortaBand)} | Band farkı: %${Number(longSenaryo.bandFarkYuzde || 0).toFixed(2)} | Band genişliği: %${Number(longSenaryo.bandGenisligiYuzde || 0).toFixed(2)} | Gövde: %${Number(longSenaryo.govdeYuzde || 0).toFixed(2)} | Mum: ${new Date(sonMum.closeTime).toLocaleString()}`);
        }

        const shortSenaryo = m.pusuSenaryosuTespit(sonMum, oncekiMum, bollinger, 'SHORT');
        if (!shortSenaryo.senaryo && shortSenaryo.aday && shortSenaryo.redSebep) {
            console.log(`🚫 [PUSU RED] ${sym} SHORT | ${shortSenaryo.redSebep} | Band genişliği: %${Number(shortSenaryo.bandGenisligiYuzde || 0).toFixed(2)} | Gövde: %${Number(shortSenaryo.govdeYuzde || 0).toFixed(2)} | Mum: ${new Date(sonMum.closeTime).toLocaleString()}`);
        }

        if (shortSenaryo.senaryo && !h.state.pusuListesi[sym]) {
            h.state.pusuListesi[sym] = {
                sym,
                yon: 'SHORT',
                targetLevel: shortSenaryo.targetLevel,
                gecenMumSayisi: 0,
                sonSayacMumZamani: sonMum.closeTime,
                olusanMumZamani: sonMum.closeTime,
                senaryo: shortSenaryo.senaryo,
                bandLevel: shortSenaryo.bandLevel,
                bandFarkYuzde: shortSenaryo.bandFarkYuzde,
                altBand: shortSenaryo.altBand,
                ortaBand: shortSenaryo.ortaBand,
                ustBand: shortSenaryo.ustBand,
                bandGenisligiYuzde: shortSenaryo.bandGenisligiYuzde,
                govdeYuzde: shortSenaryo.govdeYuzde,
                olusumZamani: now,
                kirilimGordu: false,
                kirilimZamani: 0,
                kirilimFiyati: 0,
                trendOnayiGordu: false,
                trendOnayiZamani: 0
            };
            pusuRaporu.push({ sym, yon: 'SHORT', senaryo: shortSenaryo.senaryo, bandFarkYuzde: shortSenaryo.bandFarkYuzde });
            console.log(`🔔 [YENİ PUSU] ${sym} SHORT | Hedef: ${dinamikBasamak(sym, shortSenaryo.targetLevel)} | ÜstBand: ${dinamikBasamak(sym, shortSenaryo.bandLevel)} | OrtaBand: ${dinamikBasamak(sym, shortSenaryo.ortaBand)} | Band farkı: %${Number(shortSenaryo.bandFarkYuzde || 0).toFixed(2)} | Band genişliği: %${Number(shortSenaryo.bandGenisligiYuzde || 0).toFixed(2)} | Gövde: %${Number(shortSenaryo.govdeYuzde || 0).toFixed(2)} | Mum: ${new Date(sonMum.closeTime).toLocaleString()}`);
        }

        h.state.sonDurumLoglari[`pusuKontrol_${kontrolAnahtari}`] = { zaman: now, mesaj: 'kontrol edildi' };
    }
}

async function pusulariDenetleVeIslemAc() {
    if (h.state.aktifPozisyonlar.length >= ayarlar.maxPozisyonSayisi) return;

    let buDongudeAcilanEmir = 0;
    const maxYeniEmirDongu = ayarlar.maxYeniEmirDonguBasina || 1;

    for (const [sym, pusu] of Object.entries(h.state.pusuListesi)) {
        if (buDongudeAcilanEmir >= maxYeniEmirDongu) {
            console.log(`🧯 [DÖNGÜ EMİR LİMİTİ] Bu döngüde ${buDongudeAcilanEmir}/${maxYeniEmirDongu} yeni emir açıldı. Kalan tetikler sonraki döngüye bırakıldı.`);
            break;
        }

        if (kaliciHafiza.acikPozisyonVarMi(sym)) {
            console.log(`🛡️ [PUSU TEMİZLENDİ] ${sym} için zaten aktif pozisyon var. Yeni emir engellendi.`);
            delete h.state.pusuListesi[sym];
            continue;
        }
        const canliFiyat = h.state.canliFiyatlar[sym];
        const superTrendYonu = h.state.sniperSuperTrend[sym];
        const hedef = Number(pusu.targetLevel);
        const tetikEsneklik = (ayarlar.tetikYuzdesi || 0) / 100;

        if (!canliFiyat) {
            durumLogla(sym, `⚠️ ${sym} için canlı fiyat yok, tetik bekliyor.`);
            continue;
        }

        if (!superTrendYonu) {
            durumLogla(sym, `⚠️ ${sym} için ${ayarlar.sniperPeriyodu} SuperTrend yönü yok, tetik bekliyor.`);
            continue;
        }

        let kirilim = false;
        let trendUygun = false;
        let gerekenFiyat;

        if (pusu.yon === 'LONG') {
            gerekenFiyat = hedef * (1 + tetikEsneklik);
            kirilim = canliFiyat >= gerekenFiyat;
            trendUygun = superTrendYonu === 'UP';
        } else {
            gerekenFiyat = hedef * (1 - tetikEsneklik);
            kirilim = canliFiyat <= gerekenFiyat;
            trendUygun = superTrendYonu === 'DOWN';
        }

        const now = Date.now();
        if (kirilim && !pusu.kirilimGordu) {
            pusu.kirilimGordu = true;
            pusu.kirilimZamani = now;
            pusu.kirilimFiyati = canliFiyat;
            console.log(`✅ [KIRILIM KAYDEDİLDİ] ${sym} ${pusu.yon} | Fiyat: ${dinamikBasamak(sym, canliFiyat)} | Tetik: ${dinamikBasamak(sym, gerekenFiyat)}`);
        }

        if (trendUygun && !pusu.trendOnayiGordu) {
            pusu.trendOnayiGordu = true;
            pusu.trendOnayiZamani = now;
            console.log(`✅ [SUPERTREND ONAYI KAYDEDİLDİ] ${sym} ${pusu.yon} | ${ayarlar.sniperPeriyodu} ST: ${superTrendYonu}`);
        }

        const tetikTamam = ayarlar.pusuTetikSirasiSerbest !== false
            ? (pusu.kirilimGordu && pusu.trendOnayiGordu)
            : (kirilim && trendUygun);

        let ortaBandUygun = true;
        let sniperOrtaBand = null;
        if (ayarlar.sniperOrtaBandFiltresi) {
            const sniperBollinger = h.state.sniperBollinger[sym];
            sniperOrtaBand = Number(sniperBollinger?.mid || 0);
            if (!sniperOrtaBand) {
                durumLogla(sym, `⚠️ ${sym} için ${ayarlar.sniperPeriyodu} Bollinger orta band yok, tetik bekliyor.`);
                continue;
            }
            // LONG: fiyat sniper orta bandın altında kalmalı. SHORT: fiyat sniper orta bandın üstünde kalmalı.
            ortaBandUygun = pusu.yon === 'LONG' ? canliFiyat < sniperOrtaBand : canliFiyat > sniperOrtaBand;
        }

        const fark = ((canliFiyat - hedef) / hedef) * 100;
        const ortaBandMetni = ayarlar.sniperOrtaBandFiltresi
            ? ` | ${ayarlar.sniperPeriyodu} OrtaBand: ${dinamikBasamak(sym, sniperOrtaBand)} | OrtaBand Filtre: ${ortaBandUygun ? 'UYGUN' : 'BEKLENİYOR'}`
            : '';
        const kaliteMetni = pusuKaliteMetni(pusu);
        const durumMesaji = `🔍 ${sym} | PUSU: ${pusu.yon} (${ayarlar.pusuPeriyodu}) | Sayaç: ${pusu.gecenMumSayisi || 0}/${ayarlar.maxPusuBeklemeMum ?? 3} | ST(${ayarlar.sniperPeriyodu}): ${superTrendYonu} | Fiyat: ${dinamikBasamak(sym, canliFiyat)} | Hedef: ${dinamikBasamak(sym, hedef)} | Tetik: ${dinamikBasamak(sym, gerekenFiyat)} | Fark: ${fark.toFixed(2)}% | Kırılım: ${pusu.kirilimGordu ? 'GÖRÜLDÜ' : 'BEKLENİYOR'} | Trend: ${pusu.trendOnayiGordu ? 'ONAYLANDI' : 'BEKLENİYOR'} | ${kaliteMetni}${ortaBandMetni}`;
        durumLogla(sym, durumMesaji);

        if (!tetikTamam || !ortaBandUygun) continue;

        const emirIzni = kaliciHafiza.emirAcilabilirMi(sym, pusu.yon);
        if (!emirIzni.uygun) {
            console.log(`🛡️ [TETİK ENGELLENDİ] ${sym} ${pusu.yon} | ${emirIzni.sebep}`);
            if (emirIzni.sebep.includes('zaten aktif pozisyon')) delete h.state.pusuListesi[sym];
            continue;
        }

        console.log(`🎯 [SNIPER TETİĞİ] ${sym} ${pusu.yon} | fiyat kırılımı + ${ayarlar.sniperPeriyodu} SuperTrend tamamlandı. | ${pusuKaliteMetni(pusu)}`);
        if (pusu.kirilimZamani && pusu.trendOnayiZamani) {
            const onceGelen = pusu.kirilimZamani <= pusu.trendOnayiZamani ? 'Önce kırılım, sonra SuperTrend' : 'Önce SuperTrend, sonra kırılım';
            console.log(`🧭 [TETİK SIRASI] ${sym} | ${onceGelen} | Pusu sayacı: ${pusu.gecenMumSayisi || 0}/${ayarlar.maxPusuBeklemeMum ?? 3}`);
        }
        console.log(`🚀 [POZİSYON AÇILIYOR] ${sym} ${pusu.yon}`);

        const basarili = await m.pozisyonAc(sym, pusu.yon, canliFiyat);
        if (basarili) {
            buDongudeAcilanEmir++;
            delete h.state.pusuListesi[sym];
            kaliciHafiza.kaydet('pusu-tetik-pozisyon-acildi');
            await rapor.raporGonder(true);
            if (buDongudeAcilanEmir >= maxYeniEmirDongu) break;
        }
    }
}

function pozisyonListelerindenSil(pos) {
    if (pos.yon === 'LONG') h.state.alinanlar = h.state.alinanlar.filter(x => x !== pos.sym);
    else h.state.aktifShortlar = h.state.aktifShortlar.filter(x => x !== pos.sym);
}

function pozisyonDegeriHesapla(pos) {
    const miktar = Number(pos.miktar || pos.quantity || 0);
    const giris = Number(pos.girisFiyati || 0);
    if (miktar > 0 && giris > 0) return miktar * giris;
    return (ayarlar.calisilmakIstenenUsdtMiktar || 0) * (ayarlar.mevcutKaldirac || 1);
}

function kapanisSebebiDuzenle(pos, sebep, kapanisFiyati) {
    if (!sebep || !sebep.includes('SL')) return sebep;

    const giris = Number(pos.girisFiyati || 0);
    if (!giris || !kapanisFiyati) return sebep;

    const fiyatKarYuzde = pos.yon === 'LONG'
        ? ((kapanisFiyati - giris) / giris) * 100
        : ((giris - kapanisFiyati) / giris) * 100;

    if (fiyatKarYuzde > 0.05) return 'İz Süren Stop / Kâr Koruma';
    if (Math.abs(fiyatKarYuzde) <= 0.05) return 'Başabaş Stop / Komisyon';
    return sebep;
}

async function kapanisRaporla(pos, kapanisFiyati, sebep) {
    const komisyonOrani = ayarlar.sanalKomisyonOrani ?? 0.0005;
    const pozisyonDegeri = pozisyonDegeriHesapla(pos);
    const toplamKomisyon = pozisyonDegeri * komisyonOrani * 2;
    const fiyatKarYuzdesi = pos.yon === 'LONG'
        ? ((kapanisFiyati - pos.girisFiyati) / pos.girisFiyati) * 100
        : ((pos.girisFiyati - kapanisFiyati) / pos.girisFiyati) * 100;
    const brutKarZarar = pozisyonDegeri * (fiyatKarYuzdesi / 100);
    const netKarZarar = brutKarZarar - toplamKomisyon;
    const netPozisyonYuzdesi = pozisyonDegeri > 0 ? (netKarZarar / pozisyonDegeri) * 100 : 0;
    const netMarjinYuzdesi = (ayarlar.calisilmakIstenenUsdtMiktar || 0) > 0
        ? (netKarZarar / ayarlar.calisilmakIstenenUsdtMiktar) * 100
        : 0;
    const duzeltilmisSebep = kapanisSebebiDuzenle(pos, sebep, kapanisFiyati);

    h.state.basariOzeti.toplamKomisyon += toplamKomisyon;
    h.state.basariOzeti.netKarZarar += netKarZarar;

    if (netKarZarar > 0) {
        h.state.basariOzeti.tp++;
        if (pos.yon === 'LONG') h.state.basariOzeti.longTp++;
        else h.state.basariOzeti.shortTp++;
    } else if (Math.abs(fiyatKarYuzdesi) <= 0.05 && netKarZarar <= 0) {
        h.state.basariOzeti.be++;
        if (pos.yon === 'LONG') h.state.basariOzeti.longBe++;
        else h.state.basariOzeti.shortBe++;
    } else {
        h.state.basariOzeti.sl++;
        if (pos.yon === 'LONG') h.state.basariOzeti.longSl++;
        else h.state.basariOzeti.shortSl++;
    }

    const pPrecision = h.state.basamaklar[pos.sym]?.pricePrecision ?? 4;
    const emoji = netKarZarar > 0 ? '✅' : (Math.abs(fiyatKarYuzdesi) <= 0.05 ? '⚖️' : '❌');
    const baslik = pos.sanal ? '[SANAL POZİSYON KAPANDI]' : '[POZİSYON KAPANDI]';

    await h.telegramMesajGonder(
        `${emoji} <b>${baslik}</b>\n` +
        `🔀 ${pos.sym} (${pos.yon})\n` +
        `📌 Sebep: ${duzeltilmisSebep}\n` +
        `📥 Giriş: ${pos.girisFiyati.toFixed(pPrecision)}\n` +
        `📤 Çıkış: ${kapanisFiyati.toFixed(pPrecision)}\n` +
        `📦 Pozisyon: ${pozisyonDegeri.toFixed(4)} USDT\n` +
        `📊 Fiyat Hareketi: %${fiyatKarYuzdesi.toFixed(2)}\n` +
        `📈 Brüt PNL: ${brutKarZarar.toFixed(4)} USDT\n` +
        `💸 Komisyon: ${toplamKomisyon.toFixed(4)} USDT\n` +
        `👑 Net PNL: ${netKarZarar.toFixed(4)} USDT\n` +
        `📊 Net %: %${netPozisyonYuzdesi.toFixed(2)} | Marjin %: %${netMarjinYuzdesi.toFixed(2)}`
    );
}

function sanalKapanisKontrol(pos, canliFiyat) {
    if (pos.yon === 'LONG') {
        if (canliFiyat <= pos.sl) return { kapandi: true, fiyat: pos.sl, sebep: 'Sanal SL' };
        if (canliFiyat >= pos.tp) return { kapandi: true, fiyat: pos.tp, sebep: 'Sanal TP' };
    } else {
        if (canliFiyat >= pos.sl) return { kapandi: true, fiyat: pos.sl, sebep: 'Sanal SL' };
        if (canliFiyat <= pos.tp) return { kapandi: true, fiyat: pos.tp, sebep: 'Sanal TP' };
    }
    return { kapandi: false };
}

function yuzdelikKarHesapla(pos, canliFiyat) {
    if (pos.yon === 'LONG') {
        return ((canliFiyat - pos.girisFiyati) / pos.girisFiyati) * 100;
    }
    return ((pos.girisFiyati - canliFiyat) / pos.girisFiyati) * 100;
}

function kademeliStopHesapla(pos, canliFiyat) {
    const adim = ayarlar.tpAdimYuzdesi || 0.4;
    const maxKademe = ayarlar.tpKademeSayisi || Math.floor((ayarlar.maxTpYuzdesi || 10) / adim);
    const karYuzde = yuzdelikKarHesapla(pos, canliFiyat);
    const ulasilanKademe = Math.min(Math.floor(karYuzde / adim), maxKademe);

    if (ulasilanKademe <= (pos.tpKademe || 0)) return false;
    if (ulasilanKademe <= 0) return false;

    const eskiKademe = pos.tpKademe || 0;
    let korunanKarYuzde = 0;

    if (ulasilanKademe === 1) {
        korunanKarYuzde = 0;
        pos.breakevenAktif = true;
        pos.breakevenYeniAktif = true;
    } else {
        korunanKarYuzde = (ulasilanKademe - 1) * adim;
    }

    const yeniSl = pos.yon === 'LONG'
        ? pos.girisFiyati * (1 + korunanKarYuzde / 100)
        : pos.girisFiyati * (1 - korunanKarYuzde / 100);

    const dahaIyiStop = pos.yon === 'LONG' ? yeniSl > pos.sl : yeniSl < pos.sl;
    if (!dahaIyiStop) {
        pos.tpKademe = ulasilanKademe;
        pos.mevcutTpYuzdesi = ulasilanKademe * adim;
        return false;
    }

    pos.oncekiTpKademe = eskiKademe;
    pos.tpKademe = ulasilanKademe;
    pos.mevcutTpYuzdesi = ulasilanKademe * adim;
    pos.korunanKarYuzdesi = korunanKarYuzde;
    pos.sl = yeniSl;
    return true;
}

function klasikTrailingHesapla(pos, canliFiyat) {
    let guncellemeGerekli = false;

    if (pos.yon === 'LONG') {
        const karYuzde = ((canliFiyat - pos.girisFiyati) / pos.girisFiyati) * 100;
        if (karYuzde >= ayarlar.breakevenTetikYuzde && !pos.breakevenAktif) {
            pos.sl = pos.girisFiyati;
            pos.breakevenAktif = true;
            pos.breakevenYeniAktif = true;
            guncellemeGerekli = true;
        }
        if (karYuzde >= ayarlar.izSurenStopAktivasyon) {
            const potansiyelSl = canliFiyat * (1 - ayarlar.izSurenStopTakipYuzdesi / 100);
            if (potansiyelSl > pos.sl) {
                pos.sl = potansiyelSl;
                guncellemeGerekli = true;
            }
        }
    } else {
        const karYuzde = ((pos.girisFiyati - canliFiyat) / pos.girisFiyati) * 100;
        if (karYuzde >= ayarlar.breakevenTetikYuzde && !pos.breakevenAktif) {
            pos.sl = pos.girisFiyati;
            pos.breakevenAktif = true;
            pos.breakevenYeniAktif = true;
            guncellemeGerekli = true;
        }
        if (karYuzde >= ayarlar.izSurenStopAktivasyon) {
            const potansiyelSl = canliFiyat * (1 + ayarlar.izSurenStopTakipYuzdesi / 100);
            if (potansiyelSl < pos.sl) {
                pos.sl = potansiyelSl;
                guncellemeGerekli = true;
            }
        }
    }

    return guncellemeGerekli;
}

function trailingHesapla(pos, canliFiyat) {
    if (ayarlar.stopTakipModu === 'KADEME') {
        return kademeliStopHesapla(pos, canliFiyat);
    }
    return klasikTrailingHesapla(pos, canliFiyat);
}


function stopBildirimGerekli(pos, oncekiSl, yeniSl, canliFiyat) {
    if (!ayarlar.telegramStopGuncellemeMesaji) return false;
    if (!oncekiSl || !yeniSl || oncekiSl === yeniSl) return false;

    const now = Date.now();
    const minSure = (ayarlar.stopBildirimMinSaniye || 60) * 1000;
    const minYuzde = ayarlar.stopBildirimMinYuzde || 0.2;
    const farkYuzde = Math.abs((yeniSl - oncekiSl) / oncekiSl) * 100;

    if (ayarlar.stopTakipModu === 'KADEME') return true;
    if (pos.breakevenYeniAktif) return true;
    if (!pos.sonStopBildirimZamani) return true;
    if (farkYuzde >= minYuzde && now - pos.sonStopBildirimZamani >= minSure) return true;
    if (now - pos.sonStopBildirimZamani >= minSure * 5) return true;
    return false;
}

async function stopGuncellemeMesajiGonder(pos, oncekiSl, yeniSl, canliFiyat, sanalPozisyon) {
    const pPrecision = h.state.basamaklar[pos.sym]?.pricePrecision ?? 4;
    const karYuzde = pos.yon === 'LONG'
        ? ((canliFiyat - pos.girisFiyati) / pos.girisFiyati) * 100
        : ((pos.girisFiyati - canliFiyat) / pos.girisFiyati) * 100;
    const korunanKarYuzde = pos.yon === 'LONG'
        ? ((yeniSl - pos.girisFiyati) / pos.girisFiyati) * 100
        : ((pos.girisFiyati - yeniSl) / pos.girisFiyati) * 100;
    const baslik = sanalPozisyon ? '🧪 SANAL STOP GÜNCELLENDİ' : '🔄 STOP GÜNCELLENDİ';
    const kademeSatiri = ayarlar.stopTakipModu === 'KADEME'
        ? `🎯 Kademe: ${pos.oncekiTpKademe || 0} → ${pos.tpKademe || 0}  (%${(pos.mevcutTpYuzdesi || 0).toFixed(2)})\n`
        : '';

    await h.telegramMesajGonder(
        `<b>${baslik}</b>\n\n` +
        `🔀 ${pos.sym} (${pos.yon})\n` +
        kademeSatiri +
        `📍 Anlık Fiyat: ${canliFiyat.toFixed(pPrecision)}\n` +
        `🛡️ Eski SL: ${oncekiSl.toFixed(pPrecision)}\n` +
        `🛡️ Yeni SL: ${yeniSl.toFixed(pPrecision)}\n` +
        `📈 Anlık Kâr: %${karYuzde.toFixed(2)}\n` +
        `🔒 Korunan Kâr: %${korunanKarYuzde.toFixed(2)}`
    );
    pos.sonStopBildirimZamani = Date.now();
}

async function izSurmeyiGuncelle() {
    if (h.state.aktifPozisyonlar.length === 0) return;

    let borsaPozisyonlar = [];
    if (!ayarlar.sanalEmirModu) {
        try {
            borsaPozisyonlar = await h.client.futuresPositionRisk();
        } catch (e) {
            console.error('❌ Pozisyon risk durumu çekilemedi:', e.message);
            return;
        }
    }

    for (let i = h.state.aktifPozisyonlar.length - 1; i >= 0; i--) {
        const pos = h.state.aktifPozisyonlar[i];
        const canliFiyat = h.state.canliFiyatlar[pos.sym];
        if (!canliFiyat) continue;

        const sanalPozisyon = ayarlar.sanalEmirModu || pos.sanal;
        const pPrecision = h.state.basamaklar[pos.sym]?.pricePrecision ?? 4;

        if (sanalPozisyon) {
            const oncekiSl = pos.sl;
            const guncellendi = trailingHesapla(pos, canliFiyat);
            if (guncellendi) {
                pos.sl = m.fiyatKlip(pos.sym, pos.sl);
                console.log(`🧪 [SANAL STOP GÜNCELLENDİ] ${pos.sym} ${pos.yon} | ${oncekiSl.toFixed(pPrecision)} → ${pos.sl.toFixed(pPrecision)}`);
                if (stopBildirimGerekli(pos, oncekiSl, pos.sl, canliFiyat)) {
                    await stopGuncellemeMesajiGonder(pos, oncekiSl, pos.sl, canliFiyat, true);
                    await rapor.raporGonder(true);
                }
                pos.breakevenYeniAktif = false;
                kaliciHafiza.kaydet('sanal-stop-guncellendi');
            }

            const kapanis = sanalKapanisKontrol(pos, canliFiyat);
            if (kapanis.kapandi) {
                console.log(`🧪 [SANAL KAPANDI] ${pos.sym} ${pos.yon} | Sebep: ${kapanis.sebep} | Fiyat: ${kapanis.fiyat.toFixed(pPrecision)}`);
                await kapanisRaporla(pos, kapanis.fiyat, kapanis.sebep);
                h.state.aktifPozisyonlar.splice(i, 1);
                pozisyonListelerindenSil(pos);
                kaliciHafiza.kaydet('sanal-pozisyon-kapandi');
                await rapor.raporGonder(true);
            }
            continue;
        }

        const borsaPoz = borsaPozisyonlar.find(p => p.symbol === pos.sym);
        const borsaMiktar = borsaPoz ? Math.abs(parseFloat(borsaPoz.positionAmt)) : 0;

        if (borsaMiktar === 0) {
            console.log(`🛑 [KAPANDI] ${pos.sym} pozisyonu kapandı. Rapor iletiliyor...`);
            await kapanisRaporla(pos, canliFiyat, 'Borsa pozisyonu kapandı');
            h.state.aktifPozisyonlar.splice(i, 1);
            pozisyonListelerindenSil(pos);
            await rapor.raporGonder(true);
            continue;
        }

        const oncekiSl = pos.sl;
        const guncellemeGerekli = trailingHesapla(pos, canliFiyat);

        if (guncellemeGerekli) {
            try {
                const acikEmirler = await h.client.futuresOpenOrders({ symbol: pos.sym });
                const eskiStoplar = acikEmirler.filter(o => o.type === 'STOP_MARKET');
                for (const o of eskiStoplar) {
                    await h.client.futuresCancelOrder({ symbol: pos.sym, orderId: o.orderId }).catch(() => {});
                }

                const karsiYon = pos.yon === 'LONG' ? 'SELL' : 'BUY';
                const yeniSl = m.fiyatKlip(pos.sym, pos.sl);
                await h.client.futuresOrder({
                    symbol: pos.sym,
                    side: karsiYon,
                    type: 'STOP_MARKET',
                    stopPrice: yeniSl.toFixed(pPrecision),
                    closePosition: true,
                    workingType: 'MARK_PRICE'
                });
                pos.sl = yeniSl;

                if (stopBildirimGerekli(pos, oncekiSl, yeniSl, canliFiyat)) {
                    await stopGuncellemeMesajiGonder(pos, oncekiSl, yeniSl, canliFiyat, false);
                    await rapor.raporGonder(true);
                }
                pos.breakevenYeniAktif = false;
            } catch (err) {
                console.error(`❌ [STOP GÜNCELLEME HATASI] ${pos.sym}:`, err.message);
            }
        }
    }
}

async function pusuRaporuGonder() {
    const now = Date.now();
    if (now - sonRaporZamani < RAPOR_ARALIGI) return;

    let raporListesi = [];
    if (pusuRaporu.length > 0) {
        raporListesi = pusuRaporu.splice(0, pusuRaporu.length);
    } else {
        for (const [sym, pusu] of Object.entries(h.state.pusuListesi)) {
            raporListesi.push({ sym, yon: pusu.yon, senaryo: pusu.senaryo || 'AKTIF' });
        }
    }

    if (raporListesi.length === 0) return;
    sonRaporZamani = now;

    function listeyiKisalt(liste) {
        const max = ayarlar.pusuRaporuMaxSembol || 20;
        const ilk = liste.slice(0, max).map(p => `${p.sym}(${p.senaryo})`);
        const kalan = Math.max(0, liste.length - max);
        return ilk.join(', ') + (kalan > 0 ? `\n… +${kalan} pusu daha` : '');
    }

    const longlar = raporListesi.filter(p => p.yon === 'LONG');
    const shortlar = raporListesi.filter(p => p.yon === 'SHORT');
    const longList = listeyiKisalt(longlar);
    const shortList = listeyiKisalt(shortlar);

    const mesaj = `🔔 <b>PUSU RAPORU</b>\n` +
        `📊 Toplam: ${raporListesi.length} | LONG: ${longlar.length} | SHORT: ${shortlar.length}\n\n` +
        (longList ? `📈 <b>LONG</b>\n${longList}\n\n` : '') +
        (shortList ? `📉 <b>SHORT</b>\n${shortList}` : '');

    await h.telegramMesajGonder(mesaj);
}

module.exports = {
    piyasayiTaraVePusuKur,
    pusulariDenetleVeIslemAc,
    izSurmeyiGuncelle,
    pusuRaporuGonder
};
