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
assert.strictEqual(gateOpposite.hardReject, false, 'karşıt ST1 trend R25.3te Renko pususunu hard-reject edemez; ST1 shadow kalmalı');
assert.strictEqual(gateOpposite.reason, 'ST1_SUPERTREND_KARSI_YON');
ayarlar.canliSniperTetikAktif = oldCanliTetik;

// Canlı DIRECT tetik seviyesi Entry Evolution tuğla mesafesidir; referans 0T yalnız kanıt alanıdır.
assert.strictEqual(st2Entry.canliTetikFiyati({ yon: 'SHORT', referansSeviye: 0.083657, renkoBoxSize: 0.001, renkoEntryBrickDistance: 0.75 }), 0.082907);
assert(Math.abs(st2Entry.canliTetikFiyati({ yon: 'LONG', referansSeviye: 1.2345, renkoBoxSize: 0.1, renkoEntryBrickDistance: 0.75 }) - 1.3095) < 1e-12);
assert.strictEqual(st2Entry.tetikFiyati({ yon: 'SHORT', referansSeviye: 0.083657, renkoBoxSize: 0.001, renkoEntryBrickDistance: 0.75 }), 0.082907);

// Güncel sözleşme: ST1 kendi tanılayıcı kapısını üretir fakat ST2 Renko gerçek girişini hard-reject etmez.
// DIRECT zamanlama Entry Evolution, CONFIRMED zamanlama 15m dönüş+offset; 1m Renko ST son teyittir.
ayarlar.canliSniperTetikAktif = oldCanliTetik;

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

const entrySource = fs.readFileSync('./72_st2_renko_entry.js', 'utf8');
assert(entrySource.includes("entryTimingAuthority: entryModeDecision.selectedMode === 'CONFIRMED' ? 'CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET_1M_ST' : 'RENKO_EVOLUTION_1M_RENKO_ST'"));
assert(entrySource.includes('entryEvolution.targetPrice(pusu, selectedEntryBrick)'), 'DIRECT Entry Evolution hedef hesabı korunmalı');
assert(entrySource.includes("entryModeDecision.selectedMode === 'CONFIRMED'"), 'DIRECT/CONFIRMED giriş modu ayrımı bulunmalı');
assert(entrySource.includes('Number(confirmationGate?.targetPrice || 0)'), 'CONFIRMED hedefi kapanmış dönüş + offset kapısından gelmeli');
assert(entrySource.includes('ST1 shadow'), 'ST1 gerçek giriş otoritesi değil shadow etiketi olarak kalmalı');
assert(entrySource.includes('ST1 hard red 0'), 'ST1 hard-reject sayacı sıfır sözleşmesi korunmalı');

const gateSource = fs.readFileSync('./87_st2_st1_entry_gate.js', 'utf8');
assert(gateSource.includes('ST1_KENDI_TETIGI_BEKLENIYOR'), 'ST1 shadow tanılayıcısının kendi tetik mantığı korunmalı');
assert(gateSource.includes('sonIndex - (maxBekleme - 1)'), 'ST1 pusu ömrü son 3 kapanmış 15m mum içinde yan etkisiz hesaplanmalı');

const reportSource = fs.readFileSync('./2_rapor.js', 'utf8');
assert(reportSource.includes('Entry Evolution CANLI'));
assert(reportSource.includes('ST1 yalnız GÖLGE'));
assert(reportSource.includes("...yonSatirlari('Bilimsel', premierScientific)"));
assert(reportSource.includes("...yonSatirlari('Gerçek', realPremier)"));
assert(reportSource.includes("...yonSatirlari('Shadow', shadow)"));

console.log('✅ current ST1 shadow isolation + DIRECT/CONFIRMED Renko authority + directional live report passed');
