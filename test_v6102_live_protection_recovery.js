'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6102-'));
process.env.AGROS_DATA_DIR = tempDir;
process.env.AGROS_REAL_ORDER_ARM = 'LIVE_TRADING_CONFIRMED';
process.env.AGROS_REAL_ORDER_ENV = 'MAINNET';
process.env.AGROS_REAL_ORDER_EXECUTION_ACK = 'V610_REVIEWED';
process.env.BINANCE_FUTURES_HTTP_BASE = 'https://fapi.binance.com';
process.env.BINANCE_API_KEY = 'TEST';
process.env.BINANCE_API_SECRET = 'TEST';

const state = { positions: new Map(), trades: [], algos: [], nextOrder: 100, nextAlgo: 900, getCalls: 0, missingSymbolCalls: 0 };
const client = {
  futuresPositionRisk: async ({ symbol } = {}) => {
    const rows = [...state.positions.entries()].map(([s,p]) => ({ symbol:s, positionAmt:String(p.qty), entryPrice:String(p.price), positionSide:'BOTH' }));
    if (symbol) return rows.filter(x => x.symbol === symbol).concat(rows.some(x=>x.symbol===symbol)?[]:[{symbol,positionAmt:'0',entryPrice:'0',positionSide:'BOTH'}]);
    return rows;
  },
  futuresOpenOrders: async payload => payload?.conditional ? { orders: state.algos.filter(x => x.algoStatus === 'NEW') } : [],
  futuresGetOpenAlgoOrders: async () => ({ orders: state.algos.filter(x => x.algoStatus === 'NEW') }),
  futuresCreateAlgoOrder: async payload => {
    const row={...payload,algoId:state.nextAlgo++,algoStatus:'NEW',orderType:payload.type}; state.algos.push(row); return { data: row };
  },
  futuresGetAlgoOrder: async payload => {
    if (!payload?.symbol) { state.missingSymbolCalls++; throw new Error('-1102 Mandatory parameter symbol was not sent'); }
    state.getCalls++;
    if (state.getCalls < 3) throw new Error('-2013 Algo order does not exist');
    const row=state.algos.find(x => String(x.algoId)===String(payload.algoId)||x.clientAlgoId===payload.clientAlgoId);
    if (!row) throw new Error('-2013 Algo order does not exist');
    return { data: row };
  },
  futuresCancelAlgoOrder: async payload => { if(!payload?.symbol){state.missingSymbolCalls++; throw new Error('-1102 Mandatory parameter symbol was not sent');} const r=state.algos.find(x=>x.symbol===payload.symbol&&(x.algoId===payload.algoId||x.clientAlgoId===payload.clientAlgoId)); if(r)r.algoStatus='CANCELED'; return r||{}; },
  futuresGetOrder: async () => { throw new Error('-2013'); },
  futuresAllOrders: async () => [],
  futuresCancelOrder: async () => ({}),
  futuresOrder: async payload => {
    const id=state.nextOrder++; const qty=Number(payload.quantity); const old=state.positions.get(payload.symbol)||{qty:0,price:100};
    if (String(payload.reduceOnly)==='true') {
      state.positions.set(payload.symbol,{qty:0,price:old.price});
      state.trades.push({symbol:payload.symbol,orderId:id,side:payload.side,price:String(old.price),qty:String(qty),realizedPnl:'-0.01',commission:'0.004',commissionAsset:'USDT',time:Date.now()});
    } else {
      const signed=payload.side==='BUY'?qty:-qty; state.positions.set(payload.symbol,{qty:signed,price:100});
      state.trades.push({symbol:payload.symbol,orderId:id,side:payload.side,price:'100',qty:String(qty),realizedPnl:'0',commission:'0.004',commissionAsset:'USDT',time:Date.now()});
    }
    return {symbol:payload.symbol,orderId:id,clientOrderId:payload.newClientOrderId,status:'FILLED',executedQty:String(qty),avgPrice:'100'};
  },
  futuresUserTrades: async ({symbol,startTime=0,endTime=Number.MAX_SAFE_INTEGER}) => state.trades.filter(t=>t.symbol===symbol&&t.time>=startTime&&t.time<=endTime)
};

const originalLoad=Module._load;
Module._load=function(req,parent,isMain){
  if(req==='dotenv') return {config:()=>({parsed:{}})};
  if(req==='binance-api-node') return {default:()=>client};
  if(req==='axios') return {create:()=>({}),get:async()=>({data:{}}),post:async()=>({data:{}})};
  if(req==='technicalindicators') return {};
  return originalLoad.call(this,req,parent,isMain);
};

(async()=>{
  try {
    const ayarlar=require('./ayarlar.js');
    assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar,2);
    assert.strictEqual(ayarlar.mevcutKaldirac,5);
    assert.strictEqual(ayarlar.gercekEmirMaxAktifPozisyon,1);
    const bridge=require('./50_real_order_readiness_bridge.js');
    assert.deepStrictEqual(bridge.liveRiskProfile(),{marginUsdt:2,notionalUsdt:10,leverage:5,marginType:'ISOLATED',maxActivePositions:1,protectionRequired:true});
    const executionSource=fs.readFileSync(path.join(__dirname,'85_st2_real_order_execution.js'),'utf8');
    const motorSource=fs.readFileSync(path.join(__dirname,'motor.js'),'utf8');
    assert(!executionSource.includes('record.maxActivePositions'),'kalıcı kayıt pozisyon limiti için ikinci kaynak olmamalı');
    assert(!motorSource.includes('maxActivePositions: risk.maxActivePositions'),'motor pozisyon limiti aktarıp ayarı ezmemeli');
    assert(executionSource.includes('realOrderBridge.liveRiskProfile().maxActivePositions'),'execution limiti doğrudan Ayarlar sayfasından okumalı');
    const h=require('./1_hafiza.js'); h.state.basamaklar.BTCUSDT={tickSize:0.1,pricePrecision:1};
    const ex=require('./85_st2_real_order_execution.js');
    assert.strictEqual(ex._test.algoPayloadRows({orders:[{algoId:1}]}).length,1);
    const ctx={sym:'BTCUSDT',yon:'LONG',girisFiyati:100,miktar:0.1,sl:98,tp:104,girisAnalizi:{patternId:'X',sonKapaliTuglaZamani:1},realOrderReadiness:{key:'X'}};
    const r=await ex.reserveEntry({symbol:'BTCUSDT',side:'LONG',context:ctx,maxActivePositions:99,client}); assert(r.ok);
    const fill=await ex.executeEntry({reservation:r,quantity:0.1,referencePrice:100,minQty:0.001,minNotional:5,maxNotionalDeviationPct:2,client});
    const protections=await ex.installProtections({reservation:r,side:'LONG',stopPrice:98,takeProfitPrice:104,client});
    assert(protections.stop.algoId&&protections.takeProfit.algoId,'gecikmeli/wrapped algo doğrulanmadı');
    // Simulate a filled entry followed by protection-chain failure; rollback must account both fills and set persistent block.
    const r2=await ex.reserveEntry({symbol:'ETHUSDT',side:'LONG',context:{...ctx,sym:'ETHUSDT',girisAnalizi:{patternId:'Y',sonKapaliTuglaZamani:2}},client});
    // BTC still active should already enforce max=1.
    assert.strictEqual(r2.ok,false,'tek aktif pozisyon ayarı uygulanmadı');
    await ex.rollbackEntry({reservation:r,side:'LONG',reason:'STOP_MARKET_ALGO_DOGRULANAMADI',client});
    const rec=ex.readState().records[r.fingerprint];
    assert.strictEqual(rec.status,'ROLLED_BACK');
    assert.strictEqual(rec.accounting.entryTradeCount,1,'giriş fill muhasebeye bağlanmadı');
    assert.strictEqual(rec.accounting.exitTradeCount,1,'çıkış fill muhasebeye bağlanmadı');
    assert.strictEqual(rec.accounting.commission,0.008,'iki taraf komisyonu toplanmadı');
    assert.strictEqual(ex.readState().globalBlock?.reason,'GERCEK_KORUMA_ZINCIRI_BASARISIZ');
    assert.strictEqual(state.missingSymbolCalls,0,'Algo GET/CANCEL çağrılarında zorunlu symbol eksik');
    const r3=await ex.reserveEntry({symbol:'ETHUSDT',side:'LONG',context:{...ctx,sym:'ETHUSDT',girisAnalizi:{patternId:'Z',sonKapaliTuglaZamani:3}},client});
    assert.strictEqual(r3.ok,false); assert(/^GLOBAL_BLOCK:/.test(r3.reason));
    console.log('✅ v6.10.2 settings risk + delayed Algo verification + protection global block + exact rollback accounting passed');
  } finally { Module._load=originalLoad; fs.rmSync(tempDir,{recursive:true,force:true}); }
})().catch(e=>{console.error('❌ v6.10.2 test failed:',e.stack||e);process.exitCode=1;});
