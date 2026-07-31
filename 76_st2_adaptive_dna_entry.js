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
const canonicalHistoricalPool = require('./80_st2_canonical_historical_pool.js');
const premierQuality = require('./83_st2_premier_quality_score.js');

const VERSION = 'v6.9.1-CALIBRATED-PREMIER-SCORE';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-adaptive-pattern-dna-entry.json');
const BACKUP_FILE = `${STATE_FILE}.bak`;
const HISTORICAL_FILE = path.join(DATA_DIR, 'st2-historical-training.json');
const HISTORICAL_LEDGER_FILE = path.join(DATA_DIR, 'st2-historical-training-ledger.jsonl');
const LAST_N = 3;
const MIN_NET_EDGE = () => Math.max(0, Number(ayarlar.renkoDnaSon3MinNetFarki ?? 0.10));
const MIN_RELATIVE_EDGE = () => Math.max(0, Number(ayarlar.renkoDnaSon3MinOransalFark ?? 0.15));
const HISTORICAL_PREMIER_MIN_N = () => Math.max(3, Number(ayarlar.renkoTarihselPremierMinN ?? 5));
const CANDIDATES = () => (Array.isArray(ayarlar.renkoGirisAdayTugla) ? ayarlar.renkoGirisAdayTugla : [0.25,0.50,0.75,1,1.25,1.5]).map(Number).filter(x=>x>0).sort((a,b)=>a-b);
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function r(v,d=6){return Number(n(v).toFixed(d));}
function ensure(){fs.mkdirSync(DATA_DIR,{recursive:true});}
function blank(){return {schema:3,version:VERSION,updatedAt:null,dnaProfiles:{},history:[],health:{observed:0,duplicates:0,lastTradeId:null,historicalProfiles:0,historicalSignals:0,historicalSource:null,sessionNeutralMigrations:0}};}
function mergeProfiles(target, source){
  target.closes=[...(target.closes||[]),...(source.closes||[])].sort((a,b)=>String(a?.at||'').localeCompare(String(b?.at||''))).slice(-100);
  target.changes=[...(target.changes||[]),...(source.changes||[])].sort((a,b)=>String(b?.at||'').localeCompare(String(a?.at||''))).slice(0,50);
  if(target.activeBrick==null&&source.activeBrick!=null)target.activeBrick=source.activeBrick;
  if(target.liveCandidate==null&&source.liveCandidate!=null)target.liveCandidate=source.liveCandidate;
  target.lastDecisionAt=[target.lastDecisionAt,source.lastDecisionAt].filter(Boolean).sort().at(-1)||null;
  if(source.lastDecisionAt===target.lastDecisionAt)target.lastDecision=source.lastDecision||target.lastDecision;
  target.sessionObservations=target.sessionObservations||{};
  const session=norm(source.context?.session);
  if(session!=='UNKNOWN'&&session!=='ALL')target.sessionObservations[session]=n(target.sessionObservations[session])+Math.max(1,(source.closes||[]).length);
  for(const [k,v] of Object.entries(source.sessionObservations||{}))target.sessionObservations[norm(k)]=n(target.sessionObservations[norm(k)])+n(v);
  return target;
}
function migrateSessionNeutralState(raw={}){
  const s={...blank(),...raw,health:{...blank().health,...(raw.health||{})},dnaProfiles:{}};
  let migrated=0;
  for(const old of Object.values(raw.dnaProfiles||{})){
    const context={...(old.context||{}),session:'ALL'};
    const key=dnaKey(context);
    const oldSession=norm(old.context?.session);const sessionObservations={...(old.sessionObservations||{})};if(oldSession!=='UNKNOWN'&&oldSession!=='ALL')sessionObservations[oldSession]=n(sessionObservations[oldSession])+Math.max(1,(old.closes||[]).length);const normalized={...old,key,patternKey:patternKey(context),context,sessionObservations};
    if(old.key&&old.key!==key)migrated++;
    s.dnaProfiles[key]=mergeProfiles(s.dnaProfiles[key]||{...normalized,closes:[],changes:[],sessionObservations:{}},normalized);
  }
  s.schema=3;s.version=VERSION;s.health.sessionNeutralMigrations=n(s.health.sessionNeutralMigrations)+migrated;
  return s;
}
function load(){ensure();for(const f of [STATE_FILE,BACKUP_FILE]){try{if(fs.existsSync(f))return migrateSessionNeutralState(JSON.parse(fs.readFileSync(f,'utf8')));}catch(_){}}return blank();}
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

function contextComplete(c={}){
  return ['yon','pattern','rbb','rbbw','renko6','atr','trend20'].every(k => c[k] && c[k] !== 'UNKNOWN');
}
function patternKey(c){return `${c.yon}|${c.pattern}`;}
function legacyDnaKey(c){return `${patternKey(c)}|RBB=${c.rbb}|RBBW=${c.rbbw}|RENKO6=${c.renko6}|ATR=${c.atr}|TREND20=${c.trend20}|SESSION=${c.session}`;}
function dnaKey(c){return `${patternKey(c)}|RBB=${c.rbb}|RBBW=${c.rbbw}|RENKO6=${c.renko6}|ATR=${c.atr}|TREND20=${c.trend20}`;}
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
  const index={source:files,patterns:{},dnas:{},patternLedger:{},signals:0};
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
        const pk=patternKey(c);const key=dnaKey(c);const p=index.dnas[key]||={key,patternKey:pk,context:{...c,session:'ALL'},signals:0,candidates:{},sessionObservations:{}};p.signals++;p.sessionObservations[c.session]=n(p.sessionObservations[c.session])+1;index.signals++;
        const pattern=index.patternLedger[pk]||={key:pk,signals:0,candidates:{}};pattern.signals++;
        for(const [brick,x] of Object.entries(e.candidates||{})){
          if(!x?.triggered||x?.resolved===false)continue;
          const bkey=Number(brick).toFixed(2);
          const pnl=n(x.pnlPct??x.net);
          for(const holder of [p,pattern]){
            const m=holder.candidates[bkey]||={n:0,wins:0,losses:0,be:0,net:0,grossProfit:0,grossLoss:0};
            m.n++;m.net+=pnl;if(pnl>1e-9){m.wins++;m.grossProfit+=pnl;}else if(pnl<-1e-9){m.losses++;m.grossLoss+=Math.abs(pnl);}else m.be++;
          }
        }
      }
      for(const p of Object.values(index.dnas)){
        const rows=Object.entries(p.candidates).map(([brick,m])=>({brick:Number(brick),...rawMetric({...m,closed:m.n,triggered:m.n})}));
        p.rows=rows;p.best=chooseHistorical(rows);p.source='HISTORICAL_DNA_LEDGER';
      }
      for(const p of Object.values(index.patternLedger)){
        const rows=Object.entries(p.candidates).map(([brick,m])=>({brick:Number(brick),...rawMetric({...m,closed:m.n,triggered:m.n})}));
        const best=chooseHistorical(rows);
        if(best) index.patterns[p.key]={...best,source:'HISTORICAL_PATTERN_LEDGER',key:p.key,rows,signals:p.signals};
      }
    }catch(_){}
  }
  historicalCache={signature,index};return index;
}
function positiveEvidence(x,minN=1,liveBlock=false){return Boolean(x&&n(x.n)>=minN&&n(x.net)>0&&n(x.pf)>=(liveBlock?1.30:1)&&n(x.expectancy)>0&&(!liveBlock||n(x.wins)>=2));}
function historicalEvidence(yon,pattern,context=null){
  const idx=buildHistoricalIndex();
  if(context){
    const exact=idx.dnas[dnaKey(context)];
    if(exact?.best)return {...exact.best,source:exact.source,dnaKey:exact.key,context:exact.context,exact:true};
  }
  const p=idx.patterns[`${yon}|${pattern}`];return p?{...p,exact:false}:null;
}
function historicalProfile(yon,pattern,context=null){
  const idx=buildHistoricalIndex();
  if(context){
    const exact=idx.dnas[dnaKey(context)];
    if(exact?.best&&positiveEvidence(exact.best,HISTORICAL_PREMIER_MIN_N()))return {...exact.best,source:exact.source,dnaKey:exact.key,context:exact.context,exact:true};
  }
  const p=idx.patterns[`${yon}|${pattern}`];
  return positiveEvidence(p,HISTORICAL_PREMIER_MIN_N())?{...p,exact:false}:null;
}
function historicalCompletion(){
  const canonicalSymbols = Array.isArray(canonicalHistoricalPool.SYMBOLS)
    ? [...new Set(canonicalHistoricalPool.SYMBOLS.map(x=>String(x).toUpperCase()).filter(Boolean))]
    : [];
  const total = canonicalSymbols.length || 29;
  try{
    const state=JSON.parse(fs.readFileSync(HISTORICAL_FILE,'utf8'));
    const symbols=state.symbols||{};
    const readySymbols=(canonicalSymbols.length?canonicalSymbols:Object.keys(symbols))
      .filter(sym=>n(symbols?.[sym]?.signals)>0);
    const missingSymbols=(canonicalSymbols.length?canonicalSymbols:Object.keys(symbols))
      .filter(sym=>n(symbols?.[sym]?.signals)<=0);
    const ready=readySymbols.length;
    return {ready,total,complete:total>0&&ready>=total,readySymbols,missingSymbols,source:'GLOBAL_CANONICAL_COIN_POOL'};
  }catch(_){
    return {ready:0,total,complete:false,readySymbols:[],missingSymbols:canonicalSymbols,source:'GLOBAL_CANONICAL_COIN_POOL'};
  }
}
function latestLiveReview(state,context,brick,window=LAST_N,{completedBlock=true}={}){
  const p=state.dnaProfiles[dnaKey(context)];
  const size=Math.max(1,Math.floor(n(window,LAST_N)));
  if(!p||!Array.isArray(p.closes)||p.closes.length===0)return null;
  const end=completedBlock?Math.floor(p.closes.length/size)*size:p.closes.length;
  if(end<=0)return null;
  const recent=p.closes.slice(Math.max(0,end-size),end);
  const key=Number(brick||0.75).toFixed(2);
  const rows=recent.map(x=>x.candidates?.[key]).filter(Boolean);
  const review=metric(rows);
  if(completedBlock&&review.n!==size)return null;
  return {...review,brick:Number(key),window:size,blockNumber:completedBlock?end/size:null};
}
function latestCompletedLiveReview(state,context,brick){return latestLiveReview(state,context,brick,LAST_N,{completedBlock:true});}
function premierCohortScores(){
  const idx=buildHistoricalIndex();
  return Object.values(idx.dnas||{})
    .filter(x=>x?.best&&contextComplete(x.context)&&n(x.best.n)>=Math.max(1,n(ayarlar.renkoPremierScoreMinOrnek,3)))
    .map(x=>premierQuality.scoreEvidence({context:x.context,historical:x.best}).score)
    .filter(Number.isFinite);
}
function gateDecision(source,fallbackBrick=0.75){
  const c=contextFrom(source);
  const completion=historicalCompletion();
  const decision=select(source,fallbackBrick);
  const state=load();
  const exactHistorical=historicalEvidence(c.yon,c.pattern,c);
  const liveWinner=decision.live&&positiveEvidence(decision.live,LAST_N,true);
  const reviewBrick=liveWinner?decision.live.brick:(decision.brick||exactHistorical?.brick||fallbackBrick);
  const scorePolicy=premierQuality.activePolicy();
  const liveWindow=Math.max(1,n(scorePolicy.liveWindow,LAST_N));
  const calibratedLiveReview=latestLiveReview(state,c,reviewBrick,liveWindow,{completedBlock:true});
  const liveReview=calibratedLiveReview||latestCompletedLiveReview(state,c,reviewBrick);
  const liveLast5=latestLiveReview(state,c,reviewBrick,5,{completedBlock:false});
  const liveEvidence=decision.live||liveReview||null;
  const quality=premierQuality.evaluate({
    context:c,
    historical:exactHistorical?.exact?exactHistorical:null,
    live:liveEvidence,
    historicalPoolComplete:completion.complete,
    cohortScores:premierCohortScores()
  });
  const action=quality.selected?'ALLOW':'OBSERVE';
  const executionMode=quality.executionMode;
  const evidence=liveWinner?{...decision.live,source:'LIVE_LAST3',exact:true}:(exactHistorical?.exact?exactHistorical:liveReview);
  return {
    action,allow:quality.selected,block:false,observe:!quality.selected,executionMode,
    reason:quality.reason,completion,context:c,decision,evidence:evidence||null,
    exactHistorical:exactHistorical?.exact?exactHistorical:null,liveReview,liveLast5,
    premierScore:quality,brick:n(decision.brick,fallbackBrick)
  };
}
function historicalBootstrapProfiles(){
  const idx=buildHistoricalIndex();
  const exact=Object.values(idx.dnas).filter(x=>x.best&&contextComplete(x.context)).map(x=>({key:x.key,patternKey:x.patternKey,context:x.context,closes:[],activeBrick:x.best.brick,liveCandidate:null,lastDecision:'HISTORICAL_BOOTSTRAP',lastDecisionAt:null,changes:[],historicalOnly:true,historicalSignals:x.signals}));
  if(exact.length)return exact;
  return Object.values(idx.patterns).map(x=>{const [yon,pattern]=x.key.split('|');const c={yon,pattern,rbb:'PATTERN_AGGREGATE',rbbw:'NOT_RECORDED',renko6:'NOT_RECORDED',atr:'NOT_RECORDED',trend20:'NOT_RECORDED',session:'ALL'};return {key:dnaKey(c),patternKey:x.key,context:c,closes:[],activeBrick:x.brick,liveCandidate:null,lastDecision:'HISTORICAL_PATTERN_BOOTSTRAP',lastDecisionAt:null,changes:[],historicalOnly:true,historicalSignals:x.n};});
}
function ensureProfile(s,c){const key=dnaKey(c);const session=norm(c.session);const p=s.dnaProfiles[key] ||= {key,patternKey:patternKey(c),context:{...c,session:'ALL'},closes:[],activeBrick:null,liveCandidate:null,lastDecision:'NO_LIVE_DATA',changes:[],sessionObservations:{}};if(session!=='UNKNOWN'&&session!=='ALL')p.sessionObservations[session]=n(p.sessionObservations[session])+1;return p;}
function select(source, fallbackBrick=0.75){const c=contextFrom(source);const s=load();const p=s.dnaProfiles[dnaKey(c)];const hist=historicalProfile(c.yon,c.pattern,c);const historicalBrick=n(hist?.brick,fallbackBrick);if(!p||p.closes.length<LAST_N)return {brick:historicalBrick,source:hist?'HISTORICAL_PRIOR':'ENTRY_EVOLUTION_FALLBACK',historical:hist,live:null,dnaKey:dnaKey(c),context:c,reason:hist?'HISTORICAL_BOOTSTRAP':`SON_${LAST_N}_BEKLENIYOR`};
  const blockEnd=Math.floor(p.closes.length/LAST_N)*LAST_N;const recent=p.closes.slice(Math.max(0,blockEnd-LAST_N),blockEnd);const rows=CANDIDATES().map(brick=>({brick,...metric(recent.map(x=>x.candidates?.[brick.toFixed(2)]).filter(Boolean))}));const live=rows.filter(x=>x.n===LAST_N&&x.wins>=2&&x.net>0&&x.expectancy>0&&x.pf>=1.30).sort((a,b)=>b.net-a.net||b.expectancy-a.expectancy||b.pf-a.pf)[0]||null;const base=rows.find(x=>Math.abs(x.brick-historicalBrick)<1e-9)||null;
  if(!live)return {brick:historicalBrick,source:'HISTORICAL_PRIOR',historical:hist,live:null,rows,dnaKey:p.key,context:c,reason:'SON_3_POZITIF_LIDER_YOK'};
  const edge=live.net-n(base?.net);const rel=edge/Math.max(Math.abs(n(base?.net)),0.01);if(live.brick!==historicalBrick && edge<MIN_NET_EDGE() && rel<MIN_RELATIVE_EDGE())return {brick:historicalBrick,source:'HISTORICAL_PRIOR',historical:hist,live,rows,dnaKey:p.key,context:c,reason:'FARK_ANLAMLI_DEGIL'};
  return {brick:live.brick,source:'LIVE_LAST3',historical:hist,live,rows,dnaKey:p.key,context:c,reason:'SON_3_BLOK_POZITIF_LIDER',blockNumber:blockEnd/LAST_N,nextReviewRemaining:LAST_N-(p.closes.length%LAST_N||LAST_N)};
}

function premierFor(sourceOrYon,patternArg){
  const source=typeof sourceOrYon==='object'&&sourceOrYon!==null?sourceOrYon:{yon:sourceOrYon,patternKodu:patternArg};
  const gate=gateDecision(source,n(source?.renkoEntryBrickDistance??source?.girisAnalizi?.renkoEntryBrickDistance,0.75));
  const hist=gate.exactHistorical;
  const ev=gate.evidence||hist;
  const state=load();
  const liveCount=n(state.dnaProfiles[dnaKey(gate.context)]?.closes?.length);
  return {premier:gate.allow,reason:gate.reason,patternKey:patternKey(gate.context),dnaKey:dnaKey(gate.context),source:ev?.source||gate.decision?.source||'NONE',closed:n(ev?.n),historicalN:n(hist?.n),liveN:liveCount,activeBrick:n(gate.brick,0.75),net:n(ev?.net),pf:n(ev?.pf),expectancy:n(ev?.expectancy),historical:hist||null,live:gate.decision?.live||null,executionMode:gate.executionMode,premierScore:gate.premierScore||null,score:n(gate.premierScore?.score),scoreThreshold:n(gate.premierScore?.threshold),relativeRank:n(gate.premierScore?.rank),relativeCohort:n(gate.premierScore?.cohortSize)};
}

function observe(pos,result,replays={},tradeId){const s=load();if(tradeId&&s.health.lastTradeId===tradeId){s.health.duplicates++;save(s);return null;}const c=contextFrom(pos);const p=ensureProfile(s,c);const row={at:new Date().toISOString(),tradeId:tradeId||null,sym:pos?.sym||pos?.symbol||null,candidates:{}};for(const brick of CANDIDATES()){const x=replays[brick.toFixed(2)]||replays[String(brick)]||{};if(x.triggered)row.candidates[brick.toFixed(2)]={net:r(x.net),triggered:true};}
  p.closes.push(row);p.closes=p.closes.slice(-100);const before=p.activeBrick;const decision=selectWithState(s,c,n(pos?.girisAnalizi?.renkoEntryBrickDistance,0.75));p.activeBrick=decision.brick;p.liveCandidate=decision.live?.brick??null;p.lastDecision=decision.reason;p.lastDecisionAt=row.at;if(before!=null&&Math.abs(n(before)-n(p.activeBrick))>1e-9){const change={at:row.at,dnaKey:p.key,from:before,to:p.activeBrick,reason:decision.reason};p.changes.unshift(change);p.changes=p.changes.slice(0,50);s.history.unshift(change);s.history=s.history.slice(0,200);}s.health.observed++;s.health.lastTradeId=tradeId||null;const hi=buildHistoricalIndex();s.health.historicalProfiles=Object.keys(hi.dnas).length||Object.keys(hi.patterns).length;s.health.historicalSignals=hi.signals;s.health.historicalSource=hi.source.ledger||hi.source.state;save(s);return decision;}
function selectWithState(s,c,fallbackBrick){const p=s.dnaProfiles[dnaKey(c)];const hist=historicalProfile(c.yon,c.pattern,c);const hb=n(hist?.brick,fallbackBrick);if(!p||p.closes.length<LAST_N)return {brick:hb,reason:hist?'HISTORICAL_BOOTSTRAP':`SON_${LAST_N}_BEKLENIYOR`,historical:hist,live:null};const blockEnd=Math.floor(p.closes.length/LAST_N)*LAST_N;const recent=p.closes.slice(Math.max(0,blockEnd-LAST_N),blockEnd);const rows=CANDIDATES().map(brick=>({brick,...metric(recent.map(x=>x.candidates?.[brick.toFixed(2)]).filter(Boolean))}));const live=rows.filter(x=>x.n===LAST_N&&x.wins>=2&&x.net>0&&x.expectancy>0&&x.pf>=1.30).sort((a,b)=>b.net-a.net||b.expectancy-a.expectancy)[0]||null;const base=rows.find(x=>Math.abs(x.brick-hb)<1e-9)||null;if(!live)return {brick:hb,reason:'SON_3_POZITIF_LIDER_YOK',historical:hist,live:null,rows};const edge=live.net-n(base?.net);const rel=edge/Math.max(Math.abs(n(base?.net)),0.01);if(live.brick!==hb&&edge<MIN_NET_EDGE()&&rel<MIN_RELATIVE_EDGE())return {brick:hb,reason:'FARK_ANLAMLI_DEGIL',historical:hist,live,rows};return {brick:live.brick,reason:'SON_3_BLOK_POZITIF_LIDER',historical:hist,live,rows,blockNumber:blockEnd/LAST_N,nextReviewRemaining:LAST_N-(p.closes.length%LAST_N||LAST_N)};}
function summary(){const s=load();const live=Object.values(s.dnaProfiles||{});const liveKeys=new Set(live.map(x=>x.key));const livePatterns=new Set(live.map(x=>x.patternKey));const boot=historicalBootstrapProfiles().filter(x=>!liveKeys.has(x.key)&&!(x.context?.rbb==='HISTORICAL_AGGREGATE'&&livePatterns.has(x.patternKey)));const profiles=[...live,...boot].map(p=>({...p,decision:selectWithState(s,p.context,n(p.activeBrick,0.75))}));const hi=buildHistoricalIndex();const cohort=premierCohortScores();const scored=Object.values(hi.dnas||{}).filter(x=>x?.best&&contextComplete(x.context)).map(x=>premierQuality.evaluate({context:x.context,historical:x.best,historicalPoolComplete:true,cohortScores:cohort}));const historicalPremierProfiles=scored.filter(x=>x.selected).length;const historicalNegativeProfiles=scored.filter(x=>!x.selected).length;const scorePolicy=premierQuality.activePolicy();return {version:VERSION,policy:{lastN:LAST_N,minNetEdge:MIN_NET_EDGE(),minRelativeEdge:MIN_RELATIVE_EDGE(),candidates:CANDIDATES(),historicalBootstrap:true,exactHistoricalPremier:true,unknownExactShadow:true,liveN3Review:true,premierQualityScore:true,premierScorePolicySource:scorePolicy.source,premierScoreWeights:scorePolicy.weights,premierScoreMin:scorePolicy.minScore,premierScoreMaxDynamic:scorePolicy.maxDynamic,premierScoreRelativeQuantile:scorePolicy.relativeQuantile,premierScoreLiveWindow:scorePolicy.liveWindow,relativeRanking:true},health:{...s.health,historicalProfiles:Object.keys(hi.dnas).length||Object.keys(hi.patterns).length,historicalPremierProfiles,historicalNegativeProfiles,historicalSignals:hi.signals,historicalSource:hi.source.ledger||hi.source.state,premierScoreCohort:cohort.length},profiles};}
function telegram(limit=10){const x=summary();let t=`🧬 <b>ADAPTIVE PATTERN DNA ENTRY</b>
Sürüm ${VERSION}
📚 Geçmişten hazır DNA ${x.health.historicalProfiles||0} | Tarihsel sinyal ${x.health.historicalSignals||0} | Canlı kapanış ${x.health.observed||0}
🏆 Premier Score: kalite puanı + göreceli sıralama | Kohort ${x.health.premierScoreCohort||0}
🔒 Yalnız yeni girişe atanır; açık pozisyon değişmez.
`;for(const p of x.profiles.sort((a,b)=>n(b.decision?.historical?.n)-n(a.decision?.historical?.n)).slice(0,limit)){const d=p.decision;const h=d.historical;const gate=gateDecision(p.context,n(d.brick,0.75));const q=gate.premierScore||{};t+=`
<b>${p.context.yon} ${p.context.pattern}</b>${p.historicalOnly?' | 📚 BOOTSTRAP':''}
DNA RBB=${p.context.rbb} | RBBW=${p.context.rbbw} | RENKO6=${p.context.renko6}
📚 Tarihsel ${h?Number(h.brick).toFixed(2):'YOK'}${h?` | N${h.n} PF ${n(h.pf).toFixed(2)} Exp ${n(h.expectancy)>=0?'+':''}${n(h.expectancy).toFixed(4)}`:''}
🏆 Skor ${n(q.score).toFixed(1)}/${n(q.threshold).toFixed(1)} | Sıra #${n(q.rank)}/${n(q.cohortSize)} | ${q.selected?'PREMIER':'SHADOW'}
🧾 ${q.explanation||gate.reason}
🎯 Aktif giriş ${Number(d.brick).toFixed(2)} | ${d.reason}
`; }return t.trim();}

module.exports={VERSION,STATE_FILE,BACKUP_FILE,HISTORICAL_FILE,HISTORICAL_LEDGER_FILE,LAST_N,CANDIDATES,HISTORICAL_PREMIER_MIN_N,contextFrom,contextFromHistoricalEvent,contextComplete,patternKey,dnaKey,legacyDnaKey,migrateSessionNeutralState,historicalPaths,buildHistoricalIndex,historicalEvidence,historicalProfile,historicalCompletion,latestLiveReview,latestCompletedLiveReview,premierCohortScores,gateDecision,historicalBootstrapProfiles,positiveEvidence,premierFor,select,observe,summary,telegram,metric,load,save,blank};
