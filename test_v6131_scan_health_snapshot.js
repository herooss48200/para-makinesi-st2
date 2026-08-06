const fs = require('fs');
const assert = require('assert');

const revizyon = fs.readFileSync('revizyon.js', 'utf8');
const rapor = fs.readFileSync('2_rapor.js', 'utf8');
const hafiza = fs.readFileSync('1_hafiza.js', 'utf8');

assert(revizyon.includes('const mumCacheHazir=Object.keys(h.state.yerelPusuHafizasi||{}).length;'), 'Mum sağlık sayacı hazır cache üzerinden okunmalı');
assert(revizyon.includes('const sniperCacheHazir=Object.keys(h.state.sniperMumlar||{}).length;'), '1m Renko ST sağlık sayacı hazır cache üzerinden okunmalı');
assert(revizyon.includes('superTrendSonTurGuncellenen:sniperDue?sniperGuncellenen:0'), 'Son tazeleme turu ayrı tutulmalı');
assert(rapor.includes('taramaEvreni: Number(tarama.evren || secilen || 0)'), 'Renko taraması kendi evren paydasını kullanmalı');
assert(rapor.includes('Hazır cache Mum ${veriSagligi.mumHazir}/${veriSagligi.secilen}'), 'Telegram hazır cache kapsamını açıkça göstermeli');
assert(rapor.includes('Son Renko tarama ${veriSagligi.taranan}/${veriSagligi.taramaEvreni}'), 'Telegram 202/200 gibi karışık payda üretmemeli');
assert(hafiza.includes('superTrendTazelemeCalisiyor: false'), 'Tarama çalışma durumu state içinde tanımlı olmalı');

console.log('✅ v6.13.1 scan health completed-cache + in-progress refresh separation passed');
