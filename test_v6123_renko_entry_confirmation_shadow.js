'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tmp = path.join(__dirname, `.tmp-v6123-r2-${process.pid}-${Date.now()}`);
process.env.AGROS_DATA_DIR = tmp;
fs.mkdirSync(tmp, { recursive: true });

const ayarlar = require('./ayarlar.js');
ayarlar.renkoGirisTeyitShadowAktif = true;
ayarlar.renkoGirisTeyitShadowAdayTugla = [0.25, 0.5, 0.75];
ayarlar.renkoGirisTeyitShadowStopYuzde = 1.5;
ayarlar.renkoGirisTeyitShadowTetikBeklemeDakika = 60;
ayarlar.renkoGirisTeyitShadowMaksYasamDakika = 15;
ayarlar.renkoGirisTeyitShadowStateKayitAraligiMs = 1;

const williams = require('./88_st2_williams_cycle_shadow_lab.js');
const confirmation = require('./89_st2_renko_entry_confirmation_shadow_lab.js');
confirmation._resetForTest({ deleteFiles: true });

assert.strictEqual(confirmation.settings().active, true);
assert.deepStrictEqual(confirmation.settings().candidates, [0.25, 0.5, 0.75]);
assert.strictEqual(confirmation.settings().initialStopPct, 1.5);

// W%R: uçta kalmak yetmez, nötre dönüş gerekir.
const wcfg = williams.settings();
let ws = null;
function wstep(value, id) {
    const out = williams.advanceState(ws, value, id, id, wcfg);
    ws = out.state;
    return out;
}
wstep(-5, 1);
wstep(-50, 2);
wstep(-100, 3);
let wr = williams.snapshotFromState('TESTUSDT', 'LONG', ws, -100);
assert.strictEqual(wr.supported, false);
wstep(-80, 4);
wr = williams.snapshotFromState('TESTUSDT', 'LONG', ws, -80);
assert.strictEqual(wr.supported, true);
assert.strictEqual(wr.turnState, 'VALID_TURN');

function brick(id, color, open, close, high = Math.max(open, close), low = Math.min(open, close)) {
    return { id, color, open, high, low, close, closeTime: id * 60_000 };
}

// LONG sinyali: kapanmış RED -> GREEN. Ana giriş, +0.25T teyidinden önce açılmıştır.
const bricks = [
    brick(1, 'RED', 101, 100),
    brick(2, 'GREEN', 100, 101)
];
const snap = confirmation.entrySnapshot('MYXTEST', 'LONG', bricks, 1, 101.05, {
    at: 120_000,
    williamsTurnState: 'VALID_TURN'
});
assert.strictEqual(snap.reason, 'READY');
assert.strictEqual(snap.reversal.pair, 'RED->GREEN');
assert.strictEqual(snap.candidates[0].targetPrice, 101.25);
assert.strictEqual(snap.candidates[1].targetPrice, 101.5);
assert.strictEqual(snap.candidates[2].targetPrice, 101.75);
assert(snap.candidates.every(x => x.status === 'WAITING'));

const pos = {
    sym: 'MYXTEST',
    yon: 'LONG',
    tradeId: 'MYX-R2-LONG-1',
    girisFiyati: 101.05,
    pozisyonDegeri: 100,
    acilisZamani: 120_000,
    girisAnalizi: {
        entryStrategy: 'ST2_RENKO',
        patternKodu: 'RGGG',
        renkoBoxSize: 1,
        renkoEntryConfirmationShadow: snap
    },
    // Gerçek pozisyonda dondurulmuş olan Renko koruma planı adaylara aynen kopyalanır.
    renkoExitAssignment: {
        assignmentId: 'RXT-PARENT',
        patternKey: 'LONG|RGGG',
        assignedTrailBricks: 1.25,
        assignedActivationProfitPct: 0.60,
        assignedFloorArmProfitPct: 0.50,
        assignedSafeFloorPct: 0.40,
        assignedMinimumNetProfitPct: 0.30,
        assignedRoundTripCommissionPct: 0.10,
        assignedStopUpdateStepBricks: 1.00,
        assignedTakeoverPct: 0.60,
        assignedAtrMultiplier: 2.0,
        assignedCaptureRatio: 0.60,
        renkoBoxAtOpen: 1,
        status: 'WAITING_DIRECT_PROFIT_FLOOR',
        safetyPolicySchema: 'V6112_DIRECT_PROFIT_FLOOR',
        assignmentSchema: 'V6111_POSITION_FROZEN'
    }
};

// Pozisyon açıkken deney state'e bağlanır; henüz hiçbir aday tetiklenmez.
let upd = confirmation.update(pos, 101.05, 180_000);
assert.strictEqual(upd.accepted, true);
let sum = confirmation.summary();
assert.strictEqual(sum.activeExperiments, 1);
assert.strictEqual(sum.activeWaiting, 3);
assert.strictEqual(sum.activeOpen, 0);

// Ana işlem erken SL olur. SAME_WINDOW üç aday için NO_ENTRY'dir,
// fakat FULL_LIFECYCLE deneyleri kapanmaz ve beklemeye devam eder.
const parentClose = confirmation.close(pos, {
    net: -0.1598,
    outcome: 'SL',
    reason: 'Sanal SL',
    exitPrice: 99.50,
    notional: 100,
    commissionRate: 0.0005,
    closedAt: 900_000
});
assert.strictEqual(parentClose.accepted, true);
assert(parentClose.candidates.every(x => x.status === 'NO_ENTRY_SAME_WINDOW'));
assert(confirmation.telegramText(parentClose).includes('Ana işlem kapandı; deney kapanmadı'));
sum = confirmation.summary();
assert.strictEqual(sum.sameWindow.totals.n, 3);
assert.strictEqual(sum.lifecycle.totals.n, 0);
assert.strictEqual(sum.activeWaiting, 3);

// Restart simülasyonu: RAM cache temizlenir, state diskten geri yüklenir.
confirmation._saveState(true, 901_000);
confirmation._resetForTest();
sum = confirmation.summary();
assert.strictEqual(sum.activeExperiments, 1);
assert.strictEqual(sum.activeWaiting, 3);
assert.strictEqual(sum.health.loadedActive, 1);

// Ana işlem kapalı olmasına rağmen fiyat ilerler ve adaylar bağımsız tetiklenir.
let tick = confirmation.tickAll({ MYXTEST: 101.30 }, 960_000);
assert.strictEqual(tick.activeExperiments, 1);
sum = confirmation.summary();
assert.strictEqual(sum.activeOpen, 1);   // +0.25T
assert.strictEqual(sum.activeWaiting, 2);

confirmation.tickAll({ MYXTEST: 101.55 }, 1_020_000);
sum = confirmation.summary();
assert.strictEqual(sum.activeOpen, 2);   // +0.25T, +0.50T
assert.strictEqual(sum.activeWaiting, 1);

confirmation.tickAll({ MYXTEST: 101.80 }, 1_080_000);
sum = confirmation.summary();
assert.strictEqual(sum.activeOpen, 3);
assert.strictEqual(sum.activeWaiting, 0);

// +0.25T adayı +%0.60 bölgesine çıkar; güvenli taban/Renko koruması devreye girer.
confirmation.tickAll({ MYXTEST: 102.00 }, 1_140_000);
// Geri çekilmede +0.25T varyantı kâr tabanından kapanır.
tick = confirmation.tickAll({ MYXTEST: 101.60 }, 1_200_000);
assert(tick.emitted.some(x => x.result.label === '0.25T'));
assert(tick.emitted.find(x => x.result.label === '0.25T').result.net > 0);
// K0.5 nedeniyle +0.50T de aynı geri çekilmede küçük pozitif tabandan kapanır.
assert(tick.emitted.some(x => x.result.label === '0.50T'));
assert(tick.emitted.find(x => x.result.label === '0.50T').result.net > 0);

// En geç +0.75T varyantı kendi başlangıç stopunda kapanır.
tick = confirmation.tickAll({ MYXTEST: 100.00 }, 1_260_000);
if (!tick.emitted.some(x => x.result.label === '0.75T')) {
  tick = confirmation.tickAll({ MYXTEST: 99.90 }, 1_320_000);
}
assert(tick.emitted.some(x => x.result.label === '0.75T'));

sum = confirmation.summary();
assert.strictEqual(sum.lifecycle.totals.n, 3);
assert.strictEqual(sum.lifecycle.totals.triggered, 3);
assert.strictEqual(sum.lifecycle.totals.tp, 2);
assert.strictEqual(sum.lifecycle.totals.sl, 1);
assert.strictEqual(sum.activeExperiments, 0, 'Ana kapanmış ve tüm adaylar terminal ise deney arşivlenmeli');
assert.strictEqual(sum.completedExperiments, 1);

// Parent close tekrar çağrılırsa yeni deney yaratılmamalı.
const duplicate = confirmation.close(pos, {
    net: -0.1598, outcome: 'SL', exitPrice: 99.50, notional: 100, closedAt: 900_000
});
assert.strictEqual(duplicate.reason, 'DUPLICATE_CLOSE');
assert.strictEqual(confirmation.summary().activeExperiments, 0);

// SHORT simetrisi.
const shortBricks = [
    brick(11, 'GREEN', 99, 100),
    brick(12, 'RED', 100, 99)
];
const shortSnap = confirmation.entrySnapshot('SHORTTEST', 'SHORT', shortBricks, 1, 98.90, { at: 720_000 });
assert.strictEqual(shortSnap.reversal.pair, 'GREEN->RED');
assert.strictEqual(shortSnap.candidates[0].targetPrice, 98.75);
assert.strictEqual(shortSnap.candidates[1].targetPrice, 98.5);
assert.strictEqual(shortSnap.candidates[2].targetPrice, 98.25);

// Tetik penceresi dolarsa adaylar FULL_LIFECYCLE NO_ENTRY olarak kapanır ve arşivlenir.
const shortPos = {
    sym: 'SHORTTEST', yon: 'SHORT', tradeId: 'SHORT-R2-EXPIRY',
    girisFiyati: 98.90, pozisyonDegeri: 100, acilisZamani: 720_000,
    girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'GGGR', renkoBoxSize: 1, renkoEntryConfirmationShadow: shortSnap },
    renkoExitAssignment: cloneForTest(pos.renkoExitAssignment)
};
function cloneForTest(value) { return JSON.parse(JSON.stringify(value)); }
confirmation.update(shortPos, 99.10, 730_000);
const shortParentClose = confirmation.close(shortPos, {
    net: -0.10, outcome: 'SL', reason: 'TEST_PARENT_CLOSE', exitPrice: 99.20,
    notional: 100, commissionRate: 0.0005, closedAt: 740_000
});
assert(shortParentClose.candidates.every(x => x.status === 'NO_ENTRY_SAME_WINDOW'));
tick = confirmation.tickAll({ SHORTTEST: 99.20 }, 4_400_000);
assert.strictEqual(tick.emitted.filter(x => x.result.outcome === 'NO_ENTRY').length, 3);
sum = confirmation.summary();
assert.strictEqual(sum.lifecycle.totals.n, 6);
assert.strictEqual(sum.lifecycle.totals.noEntry, 3);
assert.strictEqual(sum.activeExperiments, 0);
assert.strictEqual(sum.completedExperiments, 2);

// Entegrasyon: ana Golden Renko yetkisi değişmez; bağımsız tick aktif pozisyon yokken de çağrılır.
const src72 = fs.readFileSync(path.join(__dirname, '72_st2_renko_entry.js'), 'utf8');
const src4 = fs.readFileSync(path.join(__dirname, '4_pozisyon.js'), 'utf8');
assert(src72.includes("entryTimingAuthority: 'RENKO_EVOLUTION_1M_RENKO_ST'"));
assert(src72.includes('renkoEntryConfirmationShadow: renkoEntryConfirmation'));
assert(src4.includes('renkoEntryConfirmationShadow.tickAll(h.state.canliFiyatlar || {}, Date.now())'));
assert(src4.indexOf('renkoEntryConfirmationShadow.tickAll') < src4.indexOf('if (h.state.aktifPozisyonlar.length === 0) return'));
assert(src4.includes('renkoEntryConfirmationShadow.lifecycleTelegramText(row)'));
assert(src4.includes('renkoEntryConfirmationShadow.close(pos'));

const version = require('./versiyon.js');
assert(String(version.botSurumu).includes('6.13.5-R24'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('✅ v6.12.3-R2 Williams turn + Renko confirmation SAME_WINDOW + FULL_LIFECYCLE shadow passed');
