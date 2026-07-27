'use strict';

/**
 * AGROS ST2 Adaptive Pattern DNA Entry
 * Historical Prior + Live Evidence = Adaptive DNA Entry
 * - Tarihsel state/ledger kaynaklarını otomatik bulur.
 * - Tarihsel ledger'dan tam Pattern DNA profillerini bootstrap eder.
 * - Her Pattern DNA için son 3 bilimsel canlı kapanışın bütün giriş replay sonuçlarını karşılaştırır.
 * - Pozitif ve anlamlı üstünlük yoksa tarihsel girişe döner.
 * - Yalnız yeni pozisyonun giriş mesafesini seçer; açık pozisyonu değiştirmez.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const io = require('./53_memory_safe_io.js');
const ayarlar = require('./ayarlar.js');

const VERSION = 'v6.0.1-HISTORICAL-DNA-BOOTSTRAP';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-adaptive-pattern-dna-entry.json');
const BACKUP_FILE = `${STATE_FILE}.bak`;
const HISTORICAL_FILE = path.join(DATA_DIR, 'st2-historical-training.json');
const HISTORICAL_LEDGER_FILE = path.join(DATA_DIR, 'st2-historical-training-ledger.jsonl');
const LAST_N = 3;
const MIN_NET_EDGE = () => Math.max(0, Number(ayarlar.renkoDnaSon3MinNetFarki ?? 0.10));
const MIN_RELATIVE_EDGE = () => Math.max(0, Number(ayarlar.renkoDnaSon3MinOransalFark ?? 0.15));
const CANDIDATES = () => (Array.isArray(ayarlar.renkoGirisAdayTugla) ? ayarlar.renkoGirisAdayTugla : [0.25,0.50,0.75,1,1.25,1.5]).map(Number).filter(x=>x>0).sort((a,b)=>a-b);
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function r(v,d=6){return Number(n(v).toFixed(d));}
function ensure(){fs.mkdirSync(DATA_DIR,{recursive:true});}
function blank(){return {schema:2,version:VERSION,updatedAt:null,dnaProfiles:{},history:[],health:{observed:0,duplicates:0,lastTradeId:null,historicalProfiles:0,historicalSignals:0,historicalSource:null}};}
function load(){ensure();for(const f of [STATE_FILE,BACKUP_FILE]){try{if(fs.existsSync(f))return {...blank(),...JSON.parse(fs.readFileSync(f,'utf8'))};}catch(_){}}return blank();}
function save(s){ensure();if(fs.existsSync(STATE_FILE))fs.copyFileSync(STATE_FILE,BACKUP_FILE);s.version=VERSION;s.updatedAt=new Date().toISOString();io.writeJsonAtomic(STATE_FILE,s);return s;}
function norm(v){return String(v??'UNKNOWN').trim().toUpperCase().replace(/\s+/g,'_')||'UNKNOWN';}
function contextFrom(source={}){
  const ga=source.girisAnalizi||source;
  const bb=ga.renkoBb||source.renkoBb||{};
  const seq=ga.renkoSonTuglaDizisi||ga.renko6||source.renkoSonTuglaDizisi||source.renko6||'UNKNOWN';
  return {
    yon:norm(source.yon||ga.yon), pattern:norm(ga.patternKodu||source.patternKodu),
    rbb:norm(ga.rbb||bb.zone||bb.bolge||bb.bbZone), rbbw:norm(ga.rbbw||bb.widthRegime||bb.genislikRejimi||bb.bbw),
    renko6:norm(String(seq).slice(-6)), atr:norm(ga.atrRegime||source.atrRegime), trend20:norm(ga.trend20||source.trend20), session:norm(ga.session||source.session)
  };
}
function contextFromHistoricalEvent(event={}){
  const features = Array.isArray(event.context?.features) ? event.context.features : [];
  const get = prefix => features.find(x=>String(x).startsWith(`${prefix}=`))?.split('=').slice(1).join('=');
  return {
    yon:norm(event.yon), pattern:norm(event.patternCode),
    rbb:norm(get('BB')), rbbw:norm(get('BBW')),
    renko6:norm(event.context?.renko6||get('RENKO6')),
    atr:norm(get('ATR')), trend20:norm(get('TREND20')), session:norm(event.context?.session||get('SESSION'))
  };
}
function patternKey(c){return `${c.yon}|${c.pattern}`;}
function dnaKey(c){return `${patternKey(c)}|RBB=${c.rbb}|RBBW=${c.rbbw}|RENKO6=${c.renko6}|ATR=${c.atr}|TREND20=${c.trend20}|SESSION=${c.session}`;}
function metric(rows=[]){let net=0,gp=0,gl=0,w=0,l=0,be=0;for(const x of rows){const p=n(x.net);net+=p;if(p>1e-9){gp+=p;w++;}else if(p<-1e-9){gl+=Math.abs(p);l++;}else be++;}const N=rows.length;return {n:N,wins:w,losses:l,be,net:r(net),pf:gl>0?r(gp/gl):(gp>0?999:0),expectancy:N?r(net/N):0,wr:(w+l)?r(w/(w+l)*100,2):0};}
function historicalPaths(){
  const stateCandidates=[
    process.env.AGROS_HISTORICAL_TRAINING_FILE,
    HISTORICAL_FILE,
    path.join(__dirname,'replay-results','v570-first-test','st2-historical-training.json')
  ].filter(Boolean);
  const ledgerCandidates=[
    process.env.AGROS_HISTORICAL_TRAINING_LEDGER,
    HISTORICAL_LEDGER_FILE,
    path.join(__dirname,'replay-results','v570-first-test','st2-historical-training-ledger.jsonl')
  ].filter(Boolean);
  return {state:stateCandidates.find(fs.existsSync)||null,ledger:ledgerCandidates.find(fs.existsSync)||null};
}
let historicalCache={signature:null,index:null};
function rawMetric(raw={}){
  const count=n(raw.closed,n(raw.triggered));
  const gp=n(raw.grossProfit),gl=n(raw.grossLoss),net=n(raw.net);
  const wins=n(raw.tp,n(raw.wins));
  const losses=n(raw.sl,n(raw.losses));
  const be=n(raw.be);
  return {n:count,wins,losses,be,net:r(net),pf:gl>0?r(gp/gl):(gp>0?999:0),expectancy:count?r(net/count):0,wr:(wins+losses)?r(wins/(wins+losses)*100,2):0,grossProfit:gp,grossLoss:gl};
}
function chooseHistorical(rows=[]){return rows.filter(x=>x.n>0&&x.net>0&&x.pf>1&&x.expectancy>0).sort((a,b)=>b.expectancy-a.expectancy||b.net-a.net||b.pf-a.pf||a.brick-b.brick)[0]||rows.filter(x=>x.n>0).sort((a,b)=>b.net-a.net||b.expectancy-a.expectancy)[0]||null;}
function buildHistoricalIndex(){
  const files=historicalPaths();
  const signature=[files.state,files.ledger].map(f=>f?`${f}:${fs.statSync(f).mtimeMs}:${fs.statSync(f).size}`:'-').join('|');
  if(historicalCache.signature===signature&&historicalCache.index)return historicalCache.index;
  const index={source:files,patterns:{},dnas:{},signals:0};
  if(files.state){
    try{
      const h=JSON.parse(fs.readFileSync(files.state,'utf8'));
      for(const [key,p] of Object.entries(h.profiles||{})){
        const rows=Object.entries(p.candidates||{}).map(([brick,m])=>({brick:Number(brick),...rawMetric(m)}));
        const selected=Number(p.bestHistoricalEntry??p.bestEntry??p.selectedBrick??p.activeBrick);
        const best=rows.find(x=>Number.isFinite(selected)&&Math.abs(x.brick-selected)<1e-9)||chooseHistorical(rows);
        if(best)index.patterns[key]={...best,source:'HISTORICAL_PATTERN',key,rows};
      }
    }catch(_){}
  }
  if(files.ledger){
    try{
      const lines=fs.readFileSync(files.ledger,'utf8').split(/\r?\n/).filter(Boolean);
      for(const line of lines){
        let e;try{e=JSON.parse(line);}catch(_){continue;}
        if(e.type!=='HISTORICAL_SIGNAL')continue;
        const c=contextFromHistoricalEvent(e);if(c.yon==='UNKNOWN'||c.pattern==='UNKNOWN')continue;
        const key=dnaKey(c);const p=index.dnas[key]||={key,patternKey:patternKey(c),context:c,signals:0,candidates:{}};p.signals++;index.signals++;
        for(const [brick,x] of Object.entries(e.candidates||{})){
          if(!x?.triggered||x?.resolved===false)continue;
          const m=p.candidates[Number(brick).toFixed(2)]||={n:0,wins:0,losses:0,be:0,net:0,grossProfit:0,grossLoss:0};
          const pnl=n(x.pnlPct??x.net);m.n++;m.net+=pnl;if(pnl>1e-9){m.wins++;m.grossProfit+=pnl;}else if(pnl<-1e-9){m.losses++;m.grossLoss+=Math.abs(pnl);}else m.be++;
        }
      }
      for(const p of Object.values(index.dnas)){
        const rows=Object.entries(p.candidates).map(([brick,m])=>({brick:Number(brick),...rawMetric({...m,closed:m.n,triggered:m.n})}));
        p.rows=rows;p.best=chooseHistorical(rows);p.source='HISTORICAL_DNA_LEDGER';
      }
    }catch(_){}
  }
  historicalCache={signature,index};return index;
}
function historicalProfile(yon,pattern,context=null){
  const idx=buildHistoricalIndex();
  if(context){const exact=idx.dnas[dnaKey(context)];if(exact?.best)return {...exact.best,source:exact.source,dnaKey:exact.key,context:exact.context};}
  const p=idx.patterns[`${yon}|${pattern}`];return p?{...p}:null;
}
function historicalBootstrapProfiles(){
  const idx=buildHistoricalIndex();
  const exact=Object.values(idx.dnas).filter(x=>x.best).map(x=>({key:x.key,patternKey:x.patternKey,context:x.context,closes:[],activeBrick:x.best.brick,liveCandidate:null,lastDecision:'HISTORICAL_BOOTSTRAP',lastDecisionAt:null,changes:[],historicalOnly:true,historicalSignals:x.signals}));
  if(exact.length)return exact;
  return Object.values(idx.patterns).map(x=>{const [yon,pattern]=x.key.split('|');const c={yon,pattern,rbb:'HISTORICAL_AGGREGATE',rbbw:'UNKNOWN',renko6:'UNKNOWN',atr:'UNKNOWN',trend20:'UNKNOWN',session:'UNKNOWN'};return {key:dnaKey(c),patternKey:x.key,context:c,closes:[],activeBrick:x.brick,liveCandidate:null,lastDecision:'HISTORICAL_PATTERN_BOOTSTRAP',lastDecisionAt:null,changes:[],historicalOnly:true,historicalSignals:x.n};});
}
function ensureProfile(s,c){const key=dnaKey(c);return s.dnaProfiles[key] ||= {key,patternKey:patternKey(c),context:c,closes:[],activeBrick:null,liveCandidate:null,lastDecision:'NO_LIVE_DATA',changes:[]};}
function select(source, fallbackBrick=0.75){const c=contextFrom(source);const s=load();const p=s.dnaProfiles[dnaKey(c)];const hist=historicalProfile(c.yon,c.pattern,c);const historicalBrick=n(hist?.brick,fallbackBrick);if(!p||p.closes.length<LAST_N)return {brick:historicalBrick,source:hist?'HISTORICAL_PRIOR':'ENTRY_EVOLUTION_FALLBACK',historical:hist,live:null,dnaKey:dnaKey(c),context:c,reason:hist?'HISTORICAL_BOOTSTRAP':`SON_${LAST_N}_BEKLENIYOR`};
  const recent=p.closes.slice(-LAST_N);const rows=CANDIDATES().map(brick=>({brick,...metric(recent.map(x=>x.candidates?.[brick.toFixed(2)]).filter(Boolean))}));const live=rows.filter(x=>x.n===LAST_N&&x.net>0&&x.expectancy>0&&x.pf>1).sort((a,b)=>b.net-a.net||b.expectancy-a.expectancy||b.pf-a.pf)[0]||null;const base=rows.find(x=>Math.abs(x.brick-historicalBrick)<1e-9)||null;
  if(!live)return {brick:historicalBrick,source:'HISTORICAL_PRIOR',historical:hist,live:null,rows,dnaKey:p.key,context:c,reason:'SON_3_POZITIF_LIDER_YOK'};
  const edge=live.net-n(base?.net);const rel=edge/Math.max(Math.abs(n(base?.net)),0.01);if(live.brick!==historicalBrick && edge<MIN_NET_EDGE() && rel<MIN_RELATIVE_EDGE())return {brick:historicalBrick,source:'HISTORICAL_PRIOR',historical:hist,live,rows,dnaKey:p.key,context:c,reason:'FARK_ANLAMLI_DEGIL'};
  return {brick:live.brick,source:'LIVE_LAST3',historical:hist,live,rows,dnaKey:p.key,context:c,reason:'SON_3_POZITIF_NET_LIDER'};
}
function observe(pos,result,replays={},tradeId){const s=load();if(tradeId&&s.health.lastTradeId===tradeId){s.health.duplicates++;save(s);return null;}const c=contextFrom(pos);const p=ensureProfile(s,c);const row={at:new Date().toISOString(),tradeId:tradeId||null,sym:pos?.sym||pos?.symbol||null,candidates:{}};for(const brick of CANDIDATES()){const x=replays[brick.toFixed(2)]||replays[String(brick)]||{};if(x.triggered)row.candidates[brick.toFixed(2)]={net:r(x.net),triggered:true};}
  p.closes.push(row);p.closes=p.closes.slice(-100);const before=p.activeBrick;const decision=selectWithState(s,c,n(pos?.girisAnalizi?.renkoEntryBrickDistance,0.75));p.activeBrick=decision.brick;p.liveCandidate=decision.live?.brick??null;p.lastDecision=decision.reason;p.lastDecisionAt=row.at;if(before!=null&&Math.abs(n(before)-n(p.activeBrick))>1e-9){const change={at:row.at,dnaKey:p.key,from:before,to:p.activeBrick,reason:decision.reason};p.changes.unshift(change);p.changes=p.changes.slice(0,50);s.history.unshift(change);s.history=s.history.slice(0,200);}s.health.observed++;s.health.lastTradeId=tradeId||null;const hi=buildHistoricalIndex();s.health.historicalProfiles=Object.keys(hi.dnas).length||Object.keys(hi.patterns).length;s.health.historicalSignals=hi.signals;s.health.historicalSource=hi.source.ledger||hi.source.state;save(s);return decision;}
function selectWithState(s,c,fallbackBrick){const p=s.dnaProfiles[dnaKey(c)];const hist=historicalProfile(c.yon,c.pattern,c);const hb=n(hist?.brick,fallbackBrick);if(!p||p.closes.length<LAST_N)return {brick:hb,reason:hist?'HISTORICAL_BOOTSTRAP':`SON_${LAST_N}_BEKLENIYOR`,historical:hist,live:null};const recent=p.closes.slice(-LAST_N);const rows=CANDIDATES().map(brick=>({brick,...metric(recent.map(x=>x.candidates?.[brick.toFixed(2)]).filter(Boolean))}));const live=rows.filter(x=>x.n===LAST_N&&x.net>0&&x.expectancy>0&&x.pf>1).sort((a,b)=>b.net-a.net||b.expectancy-a.expectancy)[0]||null;const base=rows.find(x=>Math.abs(x.brick-hb)<1e-9)||null;if(!live)return {brick:hb,reason:'SON_3_POZITIF_LIDER_YOK',historical:hist,live:null,rows};const edge=live.net-n(base?.net);const rel=edge/Math.max(Math.abs(n(base?.net)),0.01);if(live.brick!==hb&&edge<MIN_NET_EDGE()&&rel<MIN_RELATIVE_EDGE())return {brick:hb,reason:'FARK_ANLAMLI_DEGIL',historical:hist,live,rows};return {brick:live.brick,reason:'SON_3_POZITIF_NET_LIDER',historical:hist,live,rows};}
function summary(){const s=load();const live=Object.values(s.dnaProfiles||{});const liveKeys=new Set(live.map(x=>x.key));const livePatterns=new Set(live.map(x=>x.patternKey));const boot=historicalBootstrapProfiles().filter(x=>!liveKeys.has(x.key)&&!(x.context?.rbb==='HISTORICAL_AGGREGATE'&&livePatterns.has(x.patternKey)));const profiles=[...live,...boot].map(p=>({...p,decision:selectWithState(s,p.context,n(p.activeBrick,0.75))}));const hi=buildHistoricalIndex();return {version:VERSION,policy:{lastN:LAST_N,minNetEdge:MIN_NET_EDGE(),minRelativeEdge:MIN_RELATIVE_EDGE(),candidates:CANDIDATES(),historicalBootstrap:true},health:{...s.health,historicalProfiles:Object.keys(hi.dnas).length||Object.keys(hi.patterns).length,historicalSignals:hi.signals,historicalSource:hi.source.ledger||hi.source.state},profiles};}
function telegram(limit=10){const x=summary();let t=`🧬 <b>ADAPTIVE PATTERN DNA ENTRY</b>\nSürüm ${VERSION}\n📚 Geçmişten hazır DNA ${x.health.historicalProfiles||0} | Tarihsel sinyal ${x.health.historicalSignals||0} | Canlı kapanış ${x.health.observed||0}\nHistorical Prior + Son-${LAST_N} Live Evidence\n🔒 Yalnız yeni girişe atanır; açık pozisyon değişmez.\n`;for(const p of x.profiles.sort((a,b)=>n(b.decision?.historical?.n)-n(a.decision?.historical?.n)).slice(0,limit)){const d=p.decision;const h=d.historical;t+=`\n<b>${p.context.yon} ${p.context.pattern}</b>${p.historicalOnly?' | 📚 BOOTSTRAP':''}\nDNA RBB=${p.context.rbb} | RBBW=${p.context.rbbw} | RENKO6=${p.context.renko6}\nATR=${p.context.atr} | TREND20=${p.context.trend20} | SESSION=${p.context.session}\n📚 Tarihsel ${h?Number(h.brick).toFixed(2):'YOK'}${h?` | N${h.n} PF ${n(h.pf).toFixed(2)} Exp ${n(h.expectancy)>=0?'+':''}${n(h.expectancy).toFixed(4)}`:''}\n⚡ Canlı son-3 ${d.live?Number(d.live.brick).toFixed(2):'BEKLENİYOR'}${d.live?` | Net ${n(d.live.net)>=0?'+':''}${n(d.live.net).toFixed(4)} PF ${n(d.live.pf).toFixed(2)}`:''}\n🎯 Aktif ${Number(d.brick).toFixed(2)} | ${d.reason}\n`; }return t.trim();}
module.exports={VERSION,STATE_FILE,BACKUP_FILE,HISTORICAL_FILE,HISTORICAL_LEDGER_FILE,LAST_N,CANDIDATES,contextFrom,contextFromHistoricalEvent,patternKey,dnaKey,historicalPaths,buildHistoricalIndex,historicalProfile,historicalBootstrapProfiles,select,observe,summary,telegram,metric,load,save,blank};
