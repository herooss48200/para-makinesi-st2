'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6120-'));

const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const st1Gate = require('./87_st2_st1_entry_gate.js');
const st2Entry = require('./72_st2_renko_entry.js');
const operation = require('./69_operation_intelligence_dashboard.js');

function shortSetupCandles(now = Date.now()) {
    const rows = [];
    for (let i = 0; i < 19; i++) {
        rows.push({
            openTime: now - (20 - i) * 900000,
            closeTime: now - (19 - i) * 900000 - 1,
            open: 100,
            high: 100.1,
            low: 99.9,
            close: 100,
            volume: 1
        });
    }
    rows.push({
        openTime: now - 900000,
        closeTime: now - 1,
        open: 101,
        high: 103,
        low: 100.8,
        close: 102,
        volume: 1
    });
    return rows;
}

// ST1 kapısı: kapanmış 15m normal mum Bollinger pususu + 3m ST aynı yön.
const sym = 'TESTUSDT';
h.state.yerelPusuHafizasi[sym] = shortSetupCandles();
h.state.trendSuperTrend[sym] = 'DOWN';
const oldCanliTetik = ayarlar.canliSniperTetikAktif;
ayarlar.canliSniperTetikAktif = false;
const gateOk = st1Gate.degerlendir(sym, 'SHORT', 100.90, 101.00);
assert.strictEqual(gateOk.uygun, true, 'SHORT ST1 15m pusu + DOWN ST birlikte uygun olmalı');
assert.strictEqual(gateOk.pusu.senaryo, 'YESIL_MUM_UST_BAND');
assert.strictEqual(gateOk.superTrendYonu, 'DOWN');
assert.strictEqual(gateOk.st1KendiTetigiKirildi, true, 'ST1 kendi gövde tetik seviyesi de kırılmış olmalı');

const gateOwnTriggerWait = st1Gate.degerlendir(sym, 'SHORT', 101.05, 101.10);
assert.strictEqual(gateOwnTriggerWait.uygun, false, 'Renko referansı kırılsa bile ST1 kendi tetik seviyesi kırılmadan giriş olmamalı');
assert.strictEqual(gateOwnTriggerWait.reason, 'ST1_KENDI_TETIGI_BEKLENIYOR');

const oncekiPusu = shortSetupCandles(Date.now() - 900000);
oncekiPusu.push({
    openTime: Date.now() - 900000,
    closeTime: Date.now() - 1,
    open: 100,
    high: 100.1,
    low: 99.9,
    close: 100,
    volume: 1
});
h.state.yerelPusuHafizasi[sym] = oncekiPusu;
const gatePreviousCandle = st1Gate.degerlendir(sym, 'SHORT', 100.90, 101.00);
assert.strictEqual(gatePreviousCandle.uygun, true, 'ST1 pususu 3 kapanmış 15m mumluk özgün ömrü içinde korunmalı');
assert.strictEqual(gatePreviousCandle.pusu.gecenMumSayisi, 1);
h.state.yerelPusuHafizasi[sym] = shortSetupCandles();

h.state.trendSuperTrend[sym] = 'UP';
const gateOpposite = st1Gate.degerlendir(sym, 'SHORT', 100.90, 101.00);
assert.strictEqual(gateOpposite.uygun, false);
assert.strictEqual(gateOpposite.hardReject, true, 'karşıt ST1 trend eski Renko pususunu iptal edebilmeli');
assert.strictEqual(gateOpposite.reason, 'ST1_SUPERTREND_KARSI_YON');
ayarlar.canliSniperTetikAktif = oldCanliTetik;

// Canlı giriş tetik seviyesi artık öğrenilmiş 0.75T değil, referans tuğla sınırıdır.
assert.strictEqual(st2Entry.canliTetikFiyati({ yon: 'SHORT', referansTuglaLow: 0.083657, referansSeviye: 0.083657 }), 0.083657);
assert.strictEqual(st2Entry.canliTetikFiyati({ yon: 'LONG', referansTuglaHigh: 1.2345, referansSeviye: 1.2345 }), 1.2345);
assert.strictEqual(st2Entry.tetikFiyati({ yon: 'SHORT', referansTuglaLow: 0.083657 }), 0.083657);

// Eski kırılım latch edilmez: ST1 uygun değilken kırılan seviye, ST1 sonradan uygun olduğunda emir açamaz.
const motor = require('./motor.js');
const originalPozisyonAc = motor.pozisyonAc;
let openCount = 0;
let lastOpenAnalysis = null;
motor.pozisyonAc = async (_sym, _yon, _price, analysis) => {
    openCount++;
    lastOpenAnalysis = analysis;
    return true;
};
h.state.yerelPusuHafizasi[sym] = shortSetupCandles();
h.state.canliFiyatlar[sym] = 101.20;
h.state.trendSuperTrend[sym] = null;
ayarlar.canliSniperTetikAktif = false;
h.state.st2Renko = {
    seriler: {}, onaySerileri1m: {}, boxSize: { [sym]: 1 }, onayBoxSize1m: {},
    pusular: {
        [sym]: {
            sym, yon: 'SHORT', patternId: 'S01', patternKodu: 'GGGG', patternSignature: 'SHORT:S01:GGGG:T-FRESH',
            referansSeviye: 101, referansTuglaLow: 101, referansTuglaHigh: 102, renkoBoxSize: 1,
            canliTetikKurulu: true, kaynakSonKapaliMumZamani: Date.now() - 1,
            renkoBb: {}, renkoSon10Tugla: []
        }
    },
    sonPatternSignature: {}, pusuTelegramBildirimleri: {}, sonIptalPatternSignature: {}
};

(async () => {
    await st2Entry.pusuDegerlendir(sym, { trend: 'DOWN' });
    h.state.canliFiyatlar[sym] = 100.90;
    await st2Entry.pusuDegerlendir(sym, { trend: 'DOWN' });
    assert.strictEqual(openCount, 0, 'ST1 yokken oluşan kırılım emir açmamalı');
    assert.strictEqual(h.state.st2Renko.pusular[sym].canliTetikKurulu, false, 'eski kırılım tüketilmeli');

    h.state.trendSuperTrend[sym] = 'DOWN';
    await st2Entry.pusuDegerlendir(sym, { trend: 'DOWN' });
    assert.strictEqual(openCount, 0, 'ST1 sonradan uygun olsa da fiyat reset olmadan eski kırılım kullanılamaz');

    h.state.canliFiyatlar[sym] = 101.10;
    await st2Entry.pusuDegerlendir(sym, { trend: 'DOWN' });
    assert.strictEqual(h.state.st2Renko.pusular[sym].canliTetikKurulu, true, 'referans üstüne dönüş yeni kırılımı kurmalı');

    h.state.canliFiyatlar[sym] = 100.95;
    await st2Entry.pusuDegerlendir(sym, { trend: 'DOWN' });
    assert.strictEqual(openCount, 1, 'ST1 uygun + reset sonrası taze canlı kırılım tek emir açmalı');
    assert.strictEqual(lastOpenAnalysis.entryTimingAuthority, 'ST1_GATE_RENKO_REFERENCE_BREAK');
    assert.strictEqual(lastOpenAnalysis.entryEvolutionMode, 'SHADOW_ONLY');
    assert.strictEqual(lastOpenAnalysis.tetikFiyati, 101);

    motor.pozisyonAc = originalPozisyonAc;
    ayarlar.canliSniperTetikAktif = oldCanliTetik;

    // Pusu ömrü Renko tuğla sayısıyla saatlerce uzamaz; 3 kapanmış 15m kaynak mumunda biter.
const sourceTime = Date.now() - 4 * 900000;
h.state.st2Renko = {
    seriler: {}, onaySerileri1m: {}, boxSize: {}, onayBoxSize1m: {},
    pusular: {
        [sym]: {
            sym,
            yon: 'SHORT',
            patternSignature: 'SHORT:S01:GGGG:T1',
            kaynakSonKapaliMumZamani: sourceTime
        }
    },
    sonPatternSignature: {}, pusuTelegramBildirimleri: {}, sonIptalPatternSignature: {}
};
const sourceCandles = [1, 2, 3].map(i => ({ closeTime: sourceTime + i * 900000, close: 100 }));
assert.strictEqual(st2Entry.eskiPusuyuSuresiDolduysaSil(sym, [], sourceCandles), true);
assert.strictEqual(h.state.st2Renko.pusular[sym], undefined);
assert.strictEqual(h.state.st2Renko.sonIptalPatternSignature[sym], 'SHORT:S01:GGGG:T1');

// Ledger yön ayrımı: Gerçek/Bilimsel Premier ve Shadow LONG/SHORT ayrı, toplamla mutabık.
const premier = (yon, sanal, outcome, net) => ({
    type: 'SCIENTIFIC_CLOSE',
    pos: { yon, sanal, renkoPremierDecision: { premier: true } },
    result: { outcome, net }
});
const shadow = (yon, outcome, net) => ({
    type: 'SCIENTIFIC_CLOSE',
    pos: { yon, sanal: true, leagueShadowOnly: true, renkoPremierDecision: { premier: false } },
    result: { outcome, net }
});
const parts = operation.scientificLedgerPartitions([
    premier('LONG', false, 'TP', 0.40),
    premier('SHORT', false, 'SL', -0.20),
    premier('LONG', true, 'BE', 0.01),
    shadow('LONG', 'SL', -0.10),
    shadow('SHORT', 'TP', 0.30)
]);
assert.deepStrictEqual(
    [parts.premier.byDirection.LONG.n, parts.premier.byDirection.LONG.tp, parts.premier.byDirection.LONG.be],
    [2, 1, 1]
);
assert.deepStrictEqual(
    [parts.realPremier.byDirection.SHORT.n, parts.realPremier.byDirection.SHORT.sl],
    [1, 1]
);
assert.deepStrictEqual(
    [parts.shadow.byDirection.LONG.sl, parts.shadow.byDirection.SHORT.tp],
    [1, 1]
);
for (const bucket of [parts.total, parts.premier, parts.realPremier, parts.virtualPremier, parts.shadow]) {
    assert.strictEqual(bucket.reconciled, true);
    assert.strictEqual(bucket.directionalReconciled, true);
    assert.strictEqual(bucket.n, bucket.byDirection.LONG.n + bucket.byDirection.SHORT.n + bucket.byDirection.UNKNOWN.n);
}

// Statik sözleşme: eski kırılım latch edilmez, Evolution canlı zamanlama yetkisi değildir.
const entrySource = fs.readFileSync('./72_st2_renko_entry.js', 'utf8');
assert(entrySource.includes("entryTimingAuthority: 'ST1_GATE_RENKO_REFERENCE_BREAK'"));
assert(entrySource.includes("entryEvolutionMode: 'SHADOW_ONLY'"));
assert(entrySource.includes('Boolean(pusu.canliTetikKurulu) && tetikGecildi'));
assert(entrySource.includes('[ESKİ KIRILIM ENGELİ]'));
assert(entrySource.includes("entryModeDecision.selectedMode === 'CONFIRMED'"), 'DIRECT/CONFIRMED giriş modu ayrımı bulunmalı');
assert(entrySource.includes('Number(confirmationGate?.targetPrice || 0)'), 'CONFIRMED hedefi kapanmış dönüş + offset kapısından gelmeli');
assert(entrySource.includes('entryEvolution.targetPrice(pusu, selectedEntryBrick)'), 'DIRECT Entry Evolution hedef hesabı korunmalı');
const gateSource = fs.readFileSync('./87_st2_st1_entry_gate.js', 'utf8');
assert(gateSource.includes('ST1_KENDI_TETIGI_BEKLENIYOR'), 'ST1 kendi tetik mantığı gerçek giriş kapısında korunmalı');
assert(gateSource.includes('sonIndex - (maxBekleme - 1)'), 'ST1 pusu ömrü son 3 kapanmış 15m mum içinde yan etkisiz hesaplanmalı');

const evolutionSource = fs.readFileSync('./73_st2_renko_entry_evolution.js', 'utf8');
assert(evolutionSource.includes('!shadowOnlyTiming'), 'shadow adayları gerçek giriş olmuş gibi otomatik tetiklenmemeli');
assert(evolutionSource.includes('ST1_GATE_RENKO_REFERENCE_APPLIED_EVOLUTION_SHADOW'));

const reportSource = fs.readFileSync('./2_rapor.js', 'utf8');
assert(reportSource.includes("...yonSatirlari('Bilimsel', premierScientific)"));
assert(reportSource.includes("...yonSatirlari('Gerçek', realPremier)"));
assert(reportSource.includes("...yonSatirlari('Shadow', shadow)"));

    console.log('✅ v6.12.0 ST1-gated Renko reference entry + fresh-cross safety + directional live report passed');
})().catch(error => {
    motor.pozisyonAc = originalPozisyonAc;
    ayarlar.canliSniperTetikAktif = oldCanliTetik;
    console.error(error);
    process.exitCode = 1;
});
