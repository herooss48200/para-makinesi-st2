const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'sanal-state.json');

function bugunAnahtari() {
    return new Date().toISOString().slice(0, 10);
}

function klasorHazirla() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function pozisyonAnahtari(pos) {
    return `${pos.sym}:${pos.yon}`;
}

function listeleriYenidenKur() {
    h.state.alinanlar = [];
    h.state.aktifShortlar = [];
    const gorulen = new Set();
    h.state.aktifPozisyonlar = (h.state.aktifPozisyonlar || []).filter(pos => {
        if (!pos || !pos.sym || !pos.yon) return false;
        const key = pozisyonAnahtari(pos);
        if (gorulen.has(key)) {
            console.log(`⚠️ [HAFIZA TEMİZLİK] Tekrarlı pozisyon atlandı: ${key}`);
            return false;
        }
        gorulen.add(key);
        if (pos.yon === 'LONG') h.state.alinanlar.push(pos.sym);
        else h.state.aktifShortlar.push(pos.sym);
        return true;
    });
}

function kaydedilecekState() {
    return {
        surum: '2.1.3',
        kayitZamani: new Date().toISOString(),
        gunlukLimitTarihi: h.state.gunlukLimitTarihi || bugunAnahtari(),
        gunlukAcilanEmirSayisi: h.state.gunlukAcilanEmirSayisi || 0,
        sanalEmirSayaci: h.state.sanalEmirSayaci || 1,
        basariOzeti: h.state.basariOzeti,
        analizOzeti: h.state.analizOzeti,
        blackboxOzet: h.state.blackboxOzet,
        aktifPozisyonlar: h.state.aktifPozisyonlar || []
    };
}

function kaydet(sebep = 'state') {
    if (!ayarlar.sanalEmirModu || !ayarlar.sanalPozisyonHafizasiAktif) return;
    try {
        klasorHazirla();
        fs.writeFileSync(STATE_FILE, JSON.stringify(kaydedilecekState(), null, 2));
        if (ayarlar.kaliciHafizaLogAktif) console.log(`💾 [KALICI HAFIZA] Kaydedildi: ${sebep}`);
    } catch (err) {
        console.error(`❌ [KALICI HAFIZA] Kaydedilemedi: ${err.message}`);
    }
}

function yukle() {
    if (!ayarlar.sanalEmirModu || !ayarlar.sanalPozisyonHafizasiAktif) return;
    try {
        klasorHazirla();
        if (!fs.existsSync(STATE_FILE)) {
            console.log('💾 [KALICI HAFIZA] Kayıt bulunamadı, temiz sanal hafıza ile başlanıyor.');
            return;
        }

        const veri = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        h.state.aktifPozisyonlar = Array.isArray(veri.aktifPozisyonlar) ? veri.aktifPozisyonlar : [];
        h.state.sanalEmirSayaci = Number(veri.sanalEmirSayaci || h.state.sanalEmirSayaci || 1);
        h.state.gunlukLimitTarihi = veri.gunlukLimitTarihi || bugunAnahtari();
        h.state.gunlukAcilanEmirSayisi = Number(veri.gunlukAcilanEmirSayisi || 0);

        if (veri.basariOzeti && typeof veri.basariOzeti === 'object') {
            h.state.basariOzeti = { ...h.state.basariOzeti, ...veri.basariOzeti };
        }

        if (veri.analizOzeti && typeof veri.analizOzeti === 'object') {
            h.state.analizOzeti = { ...h.state.analizOzeti, ...veri.analizOzeti };
        }

        if (veri.blackboxOzet && typeof veri.blackboxOzet === 'object') {
            h.state.blackboxOzet = { ...(h.state.blackboxOzet || {}), ...veri.blackboxOzet };
        }

        if (h.state.gunlukLimitTarihi !== bugunAnahtari()) {
            h.state.gunlukLimitTarihi = bugunAnahtari();
            h.state.gunlukAcilanEmirSayisi = 0;
        }

        listeleriYenidenKur();
        console.log(`💾 [KALICI HAFIZA] ${h.state.aktifPozisyonlar.length} sanal pozisyon geri yüklendi. Günlük emir: ${h.state.gunlukAcilanEmirSayisi}/${ayarlar.gunlukMaxYeniEmir || '∞'}`);
    } catch (err) {
        console.error(`❌ [KALICI HAFIZA] Yüklenemedi: ${err.message}`);
    }
}

function gunlukLimitSifirlaGerekiyorsa() {
    const bugun = bugunAnahtari();
    if (h.state.gunlukLimitTarihi !== bugun) {
        h.state.gunlukLimitTarihi = bugun;
        h.state.gunlukAcilanEmirSayisi = 0;
        kaydet('gunluk-limit-sifirlama');
    }
}

function acikPozisyonVarMi(sym, yon = null) {
    return (h.state.aktifPozisyonlar || []).some(pos => pos.sym === sym && (!yon || pos.yon === yon));
}

function emirAcilabilirMi(sym, yon) {
    gunlukLimitSifirlaGerekiyorsa();

    if (acikPozisyonVarMi(sym)) {
        return { uygun: false, sebep: `${sym} için zaten aktif pozisyon var` };
    }

    const gunlukMax = ayarlar.gunlukMaxYeniEmir || 0;
    if (gunlukMax > 0 && (h.state.gunlukAcilanEmirSayisi || 0) >= gunlukMax) {
        return { uygun: false, sebep: `Günlük emir limiti doldu: ${h.state.gunlukAcilanEmirSayisi}/${gunlukMax}` };
    }

    const maxPozisyon = ayarlar.maxPozisyonSayisi || 1;
    if ((h.state.aktifPozisyonlar || []).length >= maxPozisyon) {
        return { uygun: false, sebep: `Maksimum pozisyon dolu: ${h.state.aktifPozisyonlar.length}/${maxPozisyon}` };
    }

    return { uygun: true, sebep: 'uygun' };
}

function yeniEmirSay() {
    gunlukLimitSifirlaGerekiyorsa();
    h.state.gunlukAcilanEmirSayisi = (h.state.gunlukAcilanEmirSayisi || 0) + 1;
}

module.exports = {
    STATE_FILE,
    kaydet,
    yukle,
    listeleriYenidenKur,
    acikPozisyonVarMi,
    emirAcilabilirMi,
    yeniEmirSay,
    gunlukLimitSifirlaGerekiyorsa
};
