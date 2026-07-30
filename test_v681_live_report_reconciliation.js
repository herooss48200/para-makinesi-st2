'use strict';
const assert = require('assert');
const fs = require('fs');

const ayarlar = require('./ayarlar.js');
const blackbox = require('./8_blackbox.js');
const operation = require('./69_operation_intelligence_dashboard.js');

// Bu paket ST2 geliştirme/sanal tabanıdır; ST151GERCEK risk ayarlarını taşımaz.
assert.strictEqual(ayarlar.sanalEmirModu, true, 'ST2 geliştirme sürümü sanal kalmalı');
assert.strictEqual(Number(ayarlar.mevcutKaldirac), 20, 'ST2 mevcut sanal kaldıraç matematiği değişmemeli');
assert.strictEqual(Number(ayarlar.maxPozisyonSayisi), 100, 'ST2 mevcut sanal kapasitesi değişmemeli');
assert.strictEqual(Number(ayarlar.gunlukMaxYeniEmir), 0, 'günlük emir sayısı limitsiz kalmalı');

const duration = (6 * 3600 + 44 * 60 + 14) * 1000;
assert.strictEqual(blackbox.sureMetni(duration), '6sa 44dk 14sn', 'saat etiketi 6s değil 6sa olmalı');

const premier = extra => ({ type: 'SCIENTIFIC_CLOSE', pos: { labPremierDecision: { upperLayerIncluded: true, premierTrack: 'HISTORICAL_POSITIVE' } }, ...extra });
const shadow = extra => ({ type: 'SCIENTIFIC_CLOSE', pos: { renkoPremierDecision: { premier: false } }, ...extra });
const rows = [
  premier({ result: { outcome: 'TP', net: 1.00 } }),
  premier({ result: { outcome: 'BE', net: 0.02 } }),
  shadow({ result: { outcome: 'TP', net: 0.50 } }),
  shadow({ result: { outcome: 'SL', net: -0.30 } }),
  shadow({ result: { outcome: 'BE', net: 0.01 } })
];
const partitions = operation.scientificLedgerPartitions(rows);
assert.strictEqual(partitions.shadow.n, 3);
assert.strictEqual(partitions.shadow.tp, 1);
assert.strictEqual(partitions.shadow.sl, 1);
assert.strictEqual(partitions.shadow.be, 1, 'pozitif netli açık BE, TP sayılmamalı');
assert.strictEqual(partitions.shadow.tp + partitions.shadow.sl + partitions.shadow.be, partitions.shadow.n);
assert.strictEqual(partitions.shadow.reconciled, true);

const reportSource = fs.readFileSync(require.resolve('./2_rapor.js'), 'utf8');
const kisaltBody = reportSource.match(/function kisalt\([\s\S]*?\r?\n}\r?\n/)?.[0] || '';
assert(kisaltBody.includes('return telegramGuvenliMetin(metin)'), 'canlı rapor tam metni göndermeli');
assert(!kisaltBody.includes('.slice(0, limit)'), 'canlı rapor satır ortasında kesilmemeli');
assert(reportSource.includes('AKTİF PREMIER — ANLIK PERFORMANS SIRALAMASI'), 'zarardaki işlemler En Karlı başlığı altında gösterilmemeli');

const memorySource = fs.readFileSync(require.resolve('./1_hafiza.js'), 'utf8');
assert(memorySource.includes('function telegramMetniParcala'), 'Telegram güvenli parçalayıcı korunmalı');
assert(memorySource.includes('parcaBaslik'), 'çok parçalı mesaj numaralandırması korunmalı');
console.log('✅ AGROS ST2 v6.8.2 report reconciliation + uncut Telegram + duration truth passed');
