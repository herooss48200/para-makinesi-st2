'use strict';
const assert = require('assert');
const fs = require('fs');
const runtime = require('./93_st2_market_price_runtime.js');

(async()=>{
  runtime._resetForTest();
  const now = Date.now();
  const symbols = ['AAAUSDT','BBBUSDT','CCCUSDT','DDDUSDT'];
  const state = { canliFiyatlar:{}, canliFiyatMeta:{} };
  for (let i=0;i<symbols.length;i++) {
    const ok = runtime.seedClosed1m(state, symbols[i], [{ close:String(100+i), closeTime:now-20_000 }], 'STARTUP_CLOSED_1M');
    assert.strictEqual(ok,true);
  }
  const settings = {
    startupMarketReadyOrani:0.95,
    st2FallbackPriceMaxAgeMs:120000,
    futuresTickerBackoffBaseMs:10000,
    futuresTickerBackoffMaxMs:60000
  };

  let fetchCalls=0;
  const first = await runtime.refreshForMainLoop({
    state, symbols, activePositions:[], settings,
    forceFallbackOnly:true,
    fetchAll: async()=>{ fetchCalls++; throw new Error('SHOULD_NOT_RUN'); },
    log:{warn(){}}
  });
  assert.strictEqual(fetchCalls,0,'first audit must not touch global ticker');
  assert.strictEqual(first.usable,true);
  assert.strictEqual(first.source,'FIRST_AUDIT_CLOSED_1M');
  assert.strictEqual(first.coverage.fresh,4);

  const fallback = await runtime.refreshForMainLoop({
    state, symbols, activePositions:[], settings,
    fetchAll: async()=>{ fetchCalls++; throw new Error('FUTURES_PRICES:HARD_TIMEOUT:6000ms'); },
    log:{warn(){}}
  });
  assert.strictEqual(fetchCalls,1);
  assert.strictEqual(fallback.usable,true,'ticker failure must not kill entry scan when closed-1m coverage is fresh');
  assert.strictEqual(fallback.networkOk,false);
  assert.strictEqual(fallback.source,'CLOSED_1M_FALLBACK');
  assert.strictEqual(fallback.coverage.ratio,1);

  runtime._resetForTest();
  const realFailClosed = await runtime.refreshForMainLoop({
    state, symbols, activePositions:[{sym:'AAAUSDT',sanal:false}], settings,
    fetchAll: async()=>{ throw new Error('FUTURES_PRICES:HARD_TIMEOUT:6000ms'); },
    log:{warn(){}}
  });
  assert.strictEqual(realFailClosed.usable,false,'real open position protection must remain fail-closed without fresh network ticker');
  assert.strictEqual(realFailClosed.source,'NETWORK_REQUIRED_FOR_REAL_POSITION');

  runtime._resetForTest();
  const staleState={canliFiyatlar:{},canliFiyatMeta:{}};
  for (const sym of symbols) runtime.seedClosed1m(staleState,sym,[{close:'100',closeTime:now-300_000}]);
  const stale = await runtime.refreshForMainLoop({
    state:staleState, symbols, activePositions:[], settings, forceFallbackOnly:true,
    fetchAll:async()=>({}), log:{warn(){}}
  });
  assert.strictEqual(stale.usable,false,'stale 1m snapshots must never authorize entry scanning');
  assert.strictEqual(stale.coverage.fresh,0);

  const botSrc=fs.readFileSync('./bot.js','utf8');
  assert(botSrc.includes('forceFallbackOnly: firstSt2AuditPending'),'bot must force closed-1m snapshot on first audit');
  assert(botSrc.includes("donguAsama = 'RENKO_SCAN'"),'bot must still reach Renko scan after price runtime');
  assert(botSrc.includes("require('./72_st2_renko_entry.js').taraVeDegerlendir()"),'bot must invoke Golden Renko scan');
  const revSrc=fs.readFileSync('./revizyon.js','utf8');
  assert(revSrc.includes("seedClosed1m(h.state, sym, sniper, 'STARTUP_CLOSED_1M')"),'startup must seed fallback price from closed 1m candles');

  console.log('✅ v6.13.5-R16 market price fallback live chain passed | first audit bypasses ticker + fresh 1m fallback survives ticker failure + real protection fail-closed');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
