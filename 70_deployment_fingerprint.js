'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pkg = require('./package.json');
const version = require('./versiyon.js');

const REQUIRED = [
  '2_rapor.js',
  '69_operation_intelligence_dashboard.js',
  'test_v535_live_operations_selection_i2.js',
  'test_v536_telegram_deployment_guard.js',
  '71_st1_final_certification.js',
  '73_st2_renko_entry_evolution.js',
  'test_v557_st2_renko_entry_evolution.js',
  'test_v558_st2_renko_entry_price_path_replay.js',
  'test_v559_st2_renko_entry_dashboard.js',
  'test_v559_fix1_st2_runtime_binding_proof.js',
  'test_v559_fix2_st2_identity_close_binding.js',
  'test_v541_st1_final_certification.js'
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
}

function inspect(baseDir = __dirname) {
  const missing = REQUIRED.filter(name => !fs.existsSync(path.join(baseDir, name)));
  const report = fs.readFileSync(path.join(baseDir, '2_rapor.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(baseDir, '69_operation_intelligence_dashboard.js'), 'utf8');
  const certification = fs.readFileSync(path.join(baseDir, '71_st1_final_certification.js'), 'utf8');
  const errors = [];
  if (pkg.version !== '5.5.9-st2.2') errors.push(`package.json version ${pkg.version}; beklenen 5.5.9-st2.2`);
  if (String(version.botSurumu) !== '5.5.9-fix.2-ST2-RENKO-IDENTITY-CLOSE-BINDING') errors.push(`versiyon.js ${version.botSurumu}; beklenen 5.5.9-fix.2-ST2-RENKO-IDENTITY-CLOSE-BINDING`);
  if (!pkg.scripts?.['verify:v540']) errors.push('verify:v540 script missing');
  if (!pkg.scripts?.['verify:v541']) errors.push('verify:v541 script missing');
  if (!pkg.scripts?.['verify:v542']) errors.push('verify:v542 script missing');
  if (!report.includes("require('./69_operation_intelligence_dashboard.js')")) errors.push('2_rapor dashboard binding missing');
  if (!dashboard.includes('runtimeVersion.botSurumu')) errors.push('dynamic Telegram Operations Center version binding missing');
  if (!dashboard.includes('PREMIER KARAR VE FORM ÖZETİ')) errors.push('Premier report scope label missing');
  if (!certification.includes('ST1 FİNAL BİLİMSEL DENETİM') || !certification.includes('v5.4.1')) errors.push('ST1 Final Certification signature missing');
  if (missing.length) errors.push(`missing files: ${missing.join(', ')}`);
  return {
    ok: errors.length === 0,
    packageVersion: pkg.version,
    botVersion: version.botSurumu,
    fingerprint: sha256(path.join(baseDir, '69_operation_intelligence_dashboard.js')),
    errors
  };
}

if (require.main === module) {
  const result = inspect();
  console.log(`AGROS_DEPLOYMENT_FINGERPRINT=${result.packageVersion}|${result.botVersion}|${result.fingerprint}`);
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('✅ AGROS ST2 v5.5.9-fix.2 deployment fingerprint verified.');
  }
}
module.exports = { inspect };
