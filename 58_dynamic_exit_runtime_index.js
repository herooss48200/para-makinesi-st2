/** AGROS v4.5.8 - One-time compact runtime index builder. */
const fs = require('fs');
const dynamicExit = require('./47_dynamic_dna_exit_engine.js');

function main(){
  if(!fs.existsSync(dynamicExit.MODEL_JSON)){
    console.error('❌ dynamic-dna-exit-model.json bulunamadı.');
    process.exitCode=1;return;
  }
  const size=fs.statSync(dynamicExit.MODEL_JSON).size;
  console.log(`🧬 Ana exit modeli okunuyor: ${(size/1048576).toFixed(1)} MB`);
  const full=JSON.parse(fs.readFileSync(dynamicExit.MODEL_JSON,'utf8'));
  const runtime=dynamicExit.writeRuntimeModel(full);
  const runtimeSize=fs.statSync(dynamicExit.RUNTIME_MODEL_JSON).size;
  console.log(`✅ Runtime index hazır: ${(runtimeSize/1048576).toFixed(2)} MB | DNA ${runtime.dna.length} | Base DNA ${runtime.dnaBase.length}`);
  console.log('🛡️ Ana öğrenme modeli korunmuştur; hiçbir geçmiş kayıt silinmedi.');
}
main();
