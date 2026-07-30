'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const files = fs.readdirSync(__dirname).filter(x => x.endsWith('.js'));
for (const file of files) execFileSync(process.execPath, ['--check', path.join(__dirname, file)], { stdio: 'pipe' });
console.log(`✅ v6.7.4 full source syntax passed | ${files.length} JavaScript dosyası`);
