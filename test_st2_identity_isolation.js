const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = __dirname;
const identity = require('./0_st2_identity.js');
const summary = identity.assertRuntimeIdentity();

assert.strictEqual(summary.appId, 'ST2');
assert.strictEqual(summary.appName, 'AGROS ST2');
assert.strictEqual(summary.packageName, 'para-makinesi-st2');
assert.strictEqual(summary.repoSlug, 'para-makinesi-st2');
assert.strictEqual(summary.pm2Name, 'agros-st2');
assert.strictEqual(summary.dataDir, path.join(root, 'data'));
assert.strictEqual(summary.logDir, path.join(root, 'logs-st2'));
assert.ok(summary.dataDir.startsWith(root + path.sep));
assert.ok(summary.logDir.startsWith(root + path.sep));
assert.notStrictEqual(summary.dataDir, summary.logDir);
assert.strictEqual(fs.readFileSync(path.join(root, 'data', '.agros-instance'), 'utf8').trim(), 'ST2');

const pkg = require('./package.json');
assert.strictEqual(pkg.name, 'para-makinesi-st2');
assert.ok(String(pkg.version).includes('st2'));

const ecosystem = require('./ecosystem.config.js');
assert.strictEqual(ecosystem.apps.length, 1);
const app = ecosystem.apps[0];
assert.strictEqual(app.name, 'agros-st2');
assert.strictEqual(app.cwd, root);
assert.strictEqual(app.env.AGROS_INSTANCE_ID, 'ST2');
assert.strictEqual(app.env.AGROS_REPO_SLUG, 'para-makinesi-st2');
assert.ok(app.out_file.includes(path.join('logs-st2', 'agros-st2-out.log')));
assert.ok(app.error_file.includes(path.join('logs-st2', 'agros-st2-error.log')));

const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
for (const expected of [
  'AGROS_INSTANCE_ID=ST2',
  'AGROS_REPO_SLUG=para-makinesi-st2',
  'AGROS_PM2_NAME=agros-st2',
  'AGROS_DATA_DIR=data',
  'AGROS_LOG_DIR=logs-st2',
  'AGROS_ST2_TELEGRAM_TOKEN=',
  'AGROS_ST2_TELEGRAM_CHAT_ID='
]) assert.ok(envExample.includes(expected), `Eksik .env.example satiri: ${expected}`);

const mismatch = spawnSync(process.execPath, ['-e', "require('./0_st2_identity.js').assertRuntimeIdentity()"], {
  cwd: root,
  env: { ...process.env, AGROS_INSTANCE_ID: 'ST1' },
  encoding: 'utf8'
});
assert.notStrictEqual(mismatch.status, 0, 'ST1 instance kimligiyle ST2 baslatilamamali');
assert.ok(`${mismatch.stdout}\n${mismatch.stderr}`.includes('ST2 kodu farkli instance ile baslatilamaz'));


const hafizaSource = fs.readFileSync(path.join(root, '1_hafiza.js'), 'utf8');
assert.ok(hafizaSource.includes('process.env.AGROS_ST2_TELEGRAM_TOKEN'));
assert.ok(hafizaSource.includes('process.env.AGROS_ST2_TELEGRAM_CHAT_ID'));
assert.ok(!hafizaSource.includes('process.env.TELEGRAM_TOKEN'));
assert.ok(!hafizaSource.includes('process.env.TELEGRAM_CHAT_ID'));

const gitConfigFile = path.join(root, '.git', 'config');
if (fs.existsSync(gitConfigFile)) {
  const gitConfig = fs.readFileSync(gitConfigFile, 'utf8');
  assert.ok(gitConfig.includes('para-makinesi-st2.git'));
  assert.ok(!gitConfig.includes('para-makinesi-binance.git'));
}

const os = require('os');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-st2-identity-'));
try {
  fs.copyFileSync(path.join(root, '0_st2_identity.js'), path.join(fixture, '0_st2_identity.js'));
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: 'para-makinesi-st2' }));
  fs.copyFileSync(path.join(root, '.agros-st2.json'), path.join(fixture, '.agros-st2.json'));
  fs.mkdirSync(path.join(fixture, 'data'));
  fs.writeFileSync(path.join(fixture, 'data', 'legacy-state.json'), '{}');
  const legacyData = spawnSync(process.execPath, ['-e', "require('./0_st2_identity.js').assertRuntimeIdentity()"], {
    cwd: fixture,
    env: {
      ...process.env,
      AGROS_INSTANCE_ID: 'ST2',
      AGROS_REPO_SLUG: 'para-makinesi-st2',
      AGROS_DATA_DIR: 'data',
      AGROS_LOG_DIR: 'logs-st2',
      AGROS_ST2_ALLOW_DATA_ADOPTION: ''
    },
    encoding: 'utf8'
  });
  assert.notStrictEqual(legacyData.status, 0, 'Kimliksiz dolu data klasoru reddedilmeli');
  assert.ok(`${legacyData.stdout}\n${legacyData.stderr}`.includes('Kimliksiz dolu data klasoru'));
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

const telegram = identity.telegramPrefixEkle('TEST MESAJI');
assert.ok(telegram.includes('<b>AGROS ST2</b>'));
assert.strictEqual(identity.telegramPrefixEkle(telegram), telegram, 'Telegram etiketi iki kez eklenmemeli');

console.log('✅ AGROS ST2 identity isolation test passed');
