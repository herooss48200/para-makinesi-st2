'use strict';
const assert = require('assert');
const ag = require('./64_binance_network_resilience.js');
(async()=>{
  let tries=0;
  const value=await ag.istekYap(async()=>{ tries++; if(tries<3){ const e=new Error('socket hang up'); e.code='ECONNRESET'; throw e; } return 42; }, { retries:2, baseDelayMs:1, maxDelayMs:2, timeoutMs:100 });
  assert.strictEqual(value,42); assert.strictEqual(tries,3);
  let active=0,max=0;
  const out=await ag.havuzdaCalistir([1,2,3,4,5,6], async x=>{ active++; max=Math.max(max,active); await ag.sleep(5); active--; return x*2; }, 2);
  assert(max<=2); assert.deepStrictEqual(out.map(x=>x.value),[2,4,6,8,10,12]);
  assert(ag.geciciAgHatasi(new Error('Client network socket disconnected before secure TLS connection was established')));
  console.log('✅ v5.0.1 Binance network resilience tests passed | retry + timeout + concurrency guard');
})().catch(e=>{ console.error(e); process.exit(1); });
