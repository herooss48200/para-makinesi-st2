const assert = require('assert');
const fs = require('fs');
const path = require('path');
const identity = require('./59_dna_identity_registry.js');

const files = [identity.REGISTRY_FILE, identity.BACKUP_FILE, identity.JOURNAL_FILE, `${identity.REGISTRY_FILE}.lock`];
const snapshots = new Map(files.map(file => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));

function remove(file) { try { fs.unlinkSync(file); } catch (_) {} }
function restore() {
  for (const file of files) {
    remove(file);
    const value = snapshots.get(file);
    if (value) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, value);
    }
  }
}

try {
  files.forEach(remove);

  // Y yalnız test anahtarıdır; canlı 0/1 DNA uzayıyla çakışmaz.
  const A = 'YON=LONG|BTC=000Y|COIN=00Y1';
  const B = 'YON=SHORT|BTC=YYY1|COIN=YY10';
  const C = 'YON=LONG|BTC=0Y01|COIN=Y010';
  const D = 'YON=SHORT|BTC=00Y1|COIN=YY00';
  const E = 'YON=LONG|BTC=0YY0|COIN=Y00Y';

  const baseline = identity.readRegistry({ refresh: true });
  const startId = baseline.nextId;
  const baselineCount = baseline.count;
  const sorted = [A, B, C].map(identity.identityKey).sort();
  const first = identity.ensureMany([B, C, A], { source: 'TEST_BOOTSTRAP' });
  sorted.forEach((key, index) => assert.strictEqual(first.get(key).id, startId + index, 'Toplu atama anahtar sırasına göre deterministik olmalı'));
  const aId = first.get(identity.identityKey(A)).id;
  const maxFirstId = startId + 2;

  const alias = `${A}|BTC_TF=5M+15M|COIN_TF=1H|BB=ORTA_ALT`;
  assert.strictEqual(identity.ensure(alias, { source: 'TEST_ALIAS' }).id, aId, 'Aynı temel DNA farklı TF/BB aliasıyla yeni ID almamalı');
  assert.strictEqual(identity.find(A).id, aId, 'Tekrar okuma eski ID’yi korumalı');

  const cSnapshot = fs.readFileSync(identity.BACKUP_FILE);
  assert.strictEqual(identity.ensure(D, { source: 'TEST_NEW_DNA' }).id, maxFirstId + 1, 'Yeni DNA otomatik sıradaki ID’yi almalı');
  assert.strictEqual(identity.ensure(D, { source: 'TEST_REPEAT' }).id, maxFirstId + 1, 'Yeni DNA tekrar görüldüğünde ID değişmemeli');

  // Ana dosya bozuk, yedek ise D’den önceki durumda bırakılıyor. Append-only günlük
  // D=4 kaydını kurtarmalı ve sonraki ID’nin yeniden kullanılmasını engellemeli.
  fs.writeFileSync(identity.REGISTRY_FILE, '{BOZUK JSON');
  fs.writeFileSync(identity.BACKUP_FILE, cSnapshot);
  const recovered = identity.readRegistry({ refresh: true });
  assert.strictEqual(recovered.entries[identity.identityKey(D)].id, maxFirstId + 1, 'Günlük ana/yedek bozulmasında son ID’yi kurtarmalı');
  assert.strictEqual(recovered.nextId, maxFirstId + 2, 'Kurtarma sonrası ID tekrar kullanımı olmamalı');
  fs.writeFileSync(`${identity.REGISTRY_FILE}.lock`, JSON.stringify({ pid: 2147483647, at: new Date().toISOString() }));
  assert.strictEqual(identity.ensure(E, { source: 'TEST_AFTER_RECOVERY' }).id, maxFirstId + 2, 'PM2 çökmesinden kalan ölü PID kilidi otomatik temizlenmeli');
  assert.strictEqual(fs.existsSync(`${identity.REGISTRY_FILE}.lock`), false);

  const audit = identity.audit();
  assert.strictEqual(audit.valid, true);
  assert.strictEqual(audit.count, baselineCount + 5);
  assert.deepStrictEqual(audit.duplicateIds, []);
  assert.deepStrictEqual(audit.duplicateKeys, []);

  const invalid = identity.validateRegistry({ nextId: 3, entries: {
    [A]: { id: 1, key: A },
    [B]: { id: 1, key: B }
  }});
  assert.strictEqual(invalid.valid, false, 'Çakışan ID sessizce kabul edilmemeli');
  assert.ok(invalid.duplicateIds.length > 0);

  console.log('✅ v4.6.0 DNA identity registry tests passed | automatic, persistent, alias-safe and recovery-safe IDs');
} finally {
  restore();
}
