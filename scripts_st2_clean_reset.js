'use strict';
const fs=require('fs'); const path=require('path');
const dataDir=path.resolve(process.env.AGROS_DATA_DIR||path.join(__dirname,'data'));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backupRoot=path.resolve(process.env.AGROS_ST2_BACKUP_DIR||path.join(path.dirname(dataDir),'st2-external-backups'));
const backupDir=path.join(backupRoot,`pre-reset-${stamp}`);
function copyDir(src,dst){ if(!fs.existsSync(src)) return; fs.mkdirSync(dst,{recursive:true}); for(const e of fs.readdirSync(src,{withFileTypes:true})){ const a=path.join(src,e.name),b=path.join(dst,e.name); e.isDirectory()?copyDir(a,b):fs.copyFileSync(a,b); } }
if(fs.existsSync(dataDir)) copyDir(dataDir,backupDir); fs.mkdirSync(dataDir,{recursive:true});
const resetNames=[
 'st2-renko-entry-evolution.json','st2-renko-entry-evolution.json.bak','st2-renko-entry-evolution-ledger.jsonl',
 'st2-renko-pattern-intelligence.json','st2-renko-price-path-replay.json','st2-renko-decision-chain.json',
 'lab-lifecycle-evolution.json','lab-premier-league.json','premier-observation.json','reverse-premier.json',
 'recovery.json','recovery-state.json','restart-gap.json'
];
for(const name of resetNames){ const f=path.join(dataDir,name); if(fs.existsSync(f)) fs.rmSync(f,{force:true}); }
for(const f of fs.readdirSync(dataDir)){ if(/(?:active|position|pozisyon|pusu|restart.?gap|recovery|renko.*(?:pattern|replay|evolution)|premier|reverse|lifecycle)/i.test(f)) fs.rmSync(path.join(dataDir,f),{recursive:true,force:true}); }
const evo=require('./73_st2_renko_entry_evolution.js'); evo.write(evo.blank(),{allowEmpty:true});
fs.writeFileSync(path.join(dataDir,'st2-renko-entry-evolution-ledger.jsonl'),'');
console.log(`✅ ST2 temiz bilimsel reset tamamlandı\n📦 Yedek: ${backupDir}\n📂 Aktif data: ${dataDir}`);
