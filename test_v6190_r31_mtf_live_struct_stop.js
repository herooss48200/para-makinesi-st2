'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain){
  if(request==='dotenv') return { config:()=>({}) };
  if(request==='binance-api-node') return { default:()=>({}) };
  return originalLoad.call(this, request, parent, isMain);
};

process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-r31-test-'));

const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const entry = require('./72_st2_renko_entry.js');
const motor = require('./motor.js');

assert.deepStrictEqual(
  ayarlar.renkoCanliKaynakPeriyotlari,
  ['15m'],
  'R31.1 live authority 15m-only olmali'
);
assert.strictEqual(ayarlar.renkoYapisalStopAktif, true);
assert.strictEqual(Number(ayarlar.renkoYapisalStopBufferT), 0.25);
assert.strictEqual(Number(ayarlar.renkoYapisalStopMaksRiskYuzde), 2.5);
assert(Number(ayarlar.renkoKaynakMumLimiti) >= 201, 'EMA200 ve 15m Renko icin yeterli kaynak korunmali');

// 15m kapali mumlardan higher-TF OHLC aggregation.
const sym = 'TESTUSDT';
const base = Date.UTC(2026,7,19,0,0,0,0);
const bars=[];
for(let i=0;i<64;i++){
  const openTime=base+i*15*60_000;
  const o=100+i;
  bars.push({
    openTime,
    open:String(o), high:String(o+2), low:String(o-1), close:String(o+1), volume:'10',
    closeTime:openTime+15*60_000-1
  });
}
h.state.yerelPusuHafizasi = { [sym]: bars };
assert.strictEqual(entry.tfCandleBirlesimi(sym,'15m').length,64);
assert.strictEqual(entry.tfCandleBirlesimi(sym,'30m').length,32);
assert.strictEqual(entry.tfCandleBirlesimi(sym,'1h').length,16);
assert.strictEqual(entry.tfCandleBirlesimi(sym,'2h').length,8);
assert.strictEqual(entry.tfCandleBirlesimi(sym,'4h').length,4);
const h4=entry.tfCandleBirlesimi(sym,'4h')[0];
assert.strictEqual(Number(h4.open),100);
assert.strictEqual(Number(h4.close),116);
assert.strictEqual(Number(h4.high),117);
assert.strictEqual(Number(h4.low),99);

// Structural stop: counter-color edge + 0.25T, but never wider than 2.5% hard cap.
h.state.basamaklar ||= {};
h.state.basamaklar[sym] = { tickSize:0.01, pricePrecision:2, stepSize:0.1, quantityPrecision:1, minQty:0.1, minNotional:5 };
let plan = motor.renkoYapisalStopPlani(sym,'LONG',100,{
  entryStrategy:'ST2_RENKO', sourceTimeframe:'30m', renkoBoxSize:2,
  confirmationGate:{ boxSize:2, reversal:{ previous:{low:99,high:101} } }
});
assert.strictEqual(plan.valid,true);
assert.strictEqual(plan.stop,98.5);
assert(plan.riskPct < 2.5);

plan = motor.renkoYapisalStopPlani(sym,'LONG',100,{
  entryStrategy:'ST2_RENKO', sourceTimeframe:'1h', renkoBoxSize:2,
  confirmationGate:{ boxSize:2, reversal:{ previous:{low:96,high:98} } }
});
assert.strictEqual(plan.valid,true);
assert.strictEqual(plan.stop,97.5,'wide structure hard-cap ile 2.5% sinirlanmali');

plan = motor.renkoYapisalStopPlani(sym,'SHORT',100,{
  entryStrategy:'ST2_RENKO', sourceTimeframe:'2h', renkoBoxSize:1,
  confirmationGate:{ boxSize:1, reversal:{ previous:{low:99,high:101} } }
});
assert.strictEqual(plan.valid,true);
assert.strictEqual(plan.stop,101.25);

const source72 = fs.readFileSync('./72_st2_renko_entry.js','utf8');
assert(source72.includes('R31 FALSE-BRICK HARDENING'));
assert(source72.includes('if (key > frozenMaxKey) merged.set(key, c);'), 'frozen source eski OHLC ile overwrite edilmemeli');
assert(source72.includes('previousLow'));
assert(source72.includes('previousHigh'));

const source4 = fs.readFileSync('./4_pozisyon.js','utf8');
assert(source4.includes("const icon = net > 1e-9 ? '✅' : (net < -1e-9 ? '❌' : '⚖️')"));
assert(source4.includes('🕒 Giriş:'));
assert(source4.includes('🕒 Çıkış:'));
assert(source4.includes('sourceTimeframe'));

const source2 = fs.readFileSync('./2_rapor.js','utf8');
assert(source2.includes('CANLI TF Sayaç'));
assert(source2.includes('Onur Guard: SHORT veto'));
assert(source2.includes("require('./97_st2_mtf_scoreboard.js')"));

console.log('✅ R31 compatibility passed | live authority 15m-only | higher-TF aggregation helper dormant | 0.25T structure + 2.5% cap');
