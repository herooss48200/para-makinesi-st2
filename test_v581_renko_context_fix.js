'use strict';
const fs = require('fs');
const assert = require('assert');
const src = fs.readFileSync('75_st2_historical_renko_training.js', 'utf8');
assert(src.includes("x.color === 'GREEN' ? 'G' : 'R'"), 'RENKO6 must read canonical brick.color');
assert(!src.includes("x.renk === 'YESIL' ? 'G' : 'R'"), 'legacy/wrong renk field must not be used');
assert(src.includes('v5.8.1-HISTORICAL-WINNING-INTELLIGENCE-RENKO-CONTEXT-FIX'));
console.log('✅ v5.8.1 Renko context color-field fix passed');
