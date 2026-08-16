/** AGROS ST2 v5.6.7 — fail-closed safe startup audit */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const evo = require('./73_st2_renko_entry_evolution.js');
function verifyOrThrow(){
  if(ayarlar.entryStrategyMode!=='ST2_RENKO') throw new Error('ST2_SAFE_STARTUP: yalnız ST2_RENKO desteklenir.');
  const summary=evo.summary();
  const stateCount=Number(summary.health?.stateRecords ?? summary.total?.closed ?? 0);
  const ledgerCount=Number(summary.health?.ledgerRecords ?? summary.total?.closed ?? 0);
  if(summary.health?.stateStatus==='CORRUPT' || summary.health?.ledgerStatus==='CORRUPT') throw new Error('ST2_SAFE_STARTUP: Entry Evolution state/ledger bozuk; Trade Engine başlatılmadı.');
  if(Math.abs(stateCount-ledgerCount)>0) throw new Error(`ST2_SAFE_STARTUP: State/Ledger farkı ${stateCount}/${ledgerCount}; Trade Engine başlatılmadı.`);
  if(!Array.isArray(h.state.aktifPozisyonlar)) throw new Error('ST2_SAFE_STARTUP: aktifPozisyonlar dizisi yok.');
  const dataDir=process.env.AGROS_DATA_DIR?path.resolve(process.env.AGROS_DATA_DIR):path.join(__dirname,'data');
  if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir,{recursive:true});
  h.state.st2SafeStartupSnapshot={stateCount,ledgerCount,verifiedAt:Date.now(),stateStatus:summary.health?.stateStatus||'UNKNOWN',ledgerStatus:summary.health?.ledgerStatus||'UNKNOWN'};
  console.log(`🛡️ [ST2 SAFE STARTUP] State/Ledger ${stateCount}/${ledgerCount} | Aktif ${h.state.aktifPozisyonlar.length} | FAIL-CLOSED OK`);
  return {ok:true,stateCount,ledgerCount,active:h.state.aktifPozisyonlar.length};
}
module.exports={verifyOrThrow};
