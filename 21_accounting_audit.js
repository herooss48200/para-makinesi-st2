'use strict';

/**
 * AGROS v3.6.0 - Accounting Audit
 * Salt okunur muhasebe denetim araci.
 *
 * Kullanim:
 *   node 21_accounting_audit.js
 *   node 21_accounting_audit.js --dir data/accounting-audit-backup-20260710-054958
 *   node 21_accounting_audit.js --state data/sanal-state.json --jsonl data/argos-trade-analiz.jsonl
 *
 * Bu script hicbir dosyaya yazmaz ve otomatik onarim yapmaz.
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') args.dir = argv[++i];
    else if (arg === '--state') args.state = argv[++i];
    else if (arg === '--jsonl') args.jsonl = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Bilinmeyen arguman: ${arg}`);
  }
  return args;
}

function usage() {
  console.log(`\nAGROS Accounting Audit\n\n` +
    `  node 21_accounting_audit.js\n` +
    `  node 21_accounting_audit.js --dir <klasor>\n` +
    `  node 21_accounting_audit.js --state <sanal-state.json> --jsonl <argos-trade-analiz.jsonl>\n`);
}

function resolveFiles(args) {
  if (args.state || args.jsonl) {
    if (!args.state || !args.jsonl) {
      throw new Error('--state ve --jsonl birlikte verilmelidir.');
    }
    return {
      stateFile: path.resolve(args.state),
      jsonlFile: path.resolve(args.jsonl)
    };
  }

  const dir = path.resolve(args.dir || 'data');
  return {
    stateFile: path.join(dir, 'sanal-state.json'),
    jsonlFile: path.join(dir, 'argos-trade-analiz.jsonl')
  };
}

function assertReadable(file) {
  if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadi: ${file}`);
  fs.accessSync(file, fs.constants.R_OK);
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error(`Normal dosya degil: ${file}`);
  if (stat.size === 0) throw new Error(`Dosya bos: ${file}`);
  return stat;
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function normalize(value) {
  return String(value ?? '').trim().toUpperCase();
}

function emptySummary() {
  return {
    count: 0,
    TP: 0,
    SL: 0,
    BE: 0,
    net: 0,
    commission: 0,
    gross: 0,
    positive: 0,
    negative: 0,
    zero: 0
  };
}

function addToSummary(summary, result, net, commission) {
  summary.count += 1;
  summary.net += net;
  if (Number.isFinite(commission)) summary.commission += commission;
  summary.gross += net + (Number.isFinite(commission) ? commission : 0);
  if (result === 'TP' || result === 'SL' || result === 'BE') summary[result] += 1;
  if (net > 0) summary.positive += 1;
  else if (net < 0) summary.negative += 1;
  else summary.zero += 1;
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = String(row[field] ?? 'ALAN_YOK');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function money(value) {
  return Number(value || 0).toFixed(8);
}

function printSummary(name, summary) {
  console.log(`\n--- ${name} ---`);
  console.log(`Kapanis        : ${summary.count}`);
  console.log(`TP / SL / BE   : ${summary.TP} / ${summary.SL} / ${summary.BE}`);
  console.log(`Poz/Neg/Sifir  : ${summary.positive} / ${summary.negative} / ${summary.zero}`);
  console.log(`Brut PNL       : ${money(summary.gross)} USDT`);
  console.log(`Komisyon       : ${money(summary.commission)} USDT`);
  console.log(`Net PNL        : ${money(summary.net)} USDT`);
}

function collectNumericLeaves(value, prefix = '', out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'number' && Number.isFinite(child)) {
      out.push([full, child]);
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      collectNumericLeaves(child, full, out);
    }
  }
  return out;
}

function findStateCandidates(state) {
  const leaves = collectNumericLeaves(state);
  const wanted = /(net|pnl|kasa|kar|zarar|profit|loss|tp|sl|be|kapan|acilan|toplam)/i;
  return leaves.filter(([key]) => wanted.test(key));
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) return usage();

  const { stateFile, jsonlFile } = resolveFiles(args);
  const stateStat = assertReadable(stateFile);
  const jsonlStat = assertReadable(jsonlFile);

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const rawLines = fs.readFileSync(jsonlFile, 'utf8').split(/\r?\n/).filter(Boolean);

  const rows = [];
  const invalidJson = [];
  rawLines.forEach((line, index) => {
    try {
      rows.push({ ...JSON.parse(line), __line: index + 1 });
    } catch (error) {
      invalidJson.push({ line: index + 1, error: error.message });
    }
  });

  const closings = rows.filter(row => normalize(row.kayitTipi) === 'KAPANIS');
  const openings = rows.filter(row => normalize(row.kayitTipi) === 'ACILIS');
  const activePositions = Array.isArray(state.aktifPozisyonlar) ? state.aktifPozisyonlar : [];
  const activeIds = new Set(activePositions.map(p => String(p.tradeId ?? '')).filter(Boolean));

  const byTradeId = new Map();
  for (const row of rows) {
    const id = String(row.tradeId ?? 'ID_YOK');
    if (!byTradeId.has(id)) byTradeId.set(id, []);
    byTradeId.get(id).push(row);
  }

  const audit = {
    GENEL: emptySummary(),
    LONG: emptySummary(),
    SHORT: emptySummary(),
    invalidNet: [],
    invalidDirection: [],
    duplicateClosingIds: [],
    signConflicts: [],
    seenClosingIds: new Set()
  };

  for (const row of closings) {
    const direction = normalize(row.yon);
    const result = normalize(row.sonuc);
    const net = toNumber(row.netKarZarar);
    const commission = toNumber(row.komisyon);
    const tradeId = String(row.tradeId ?? 'ID_YOK');

    if (audit.seenClosingIds.has(tradeId)) {
      audit.duplicateClosingIds.push({ line: row.__line, tradeId, symbol: row.symbol });
    }
    audit.seenClosingIds.add(tradeId);

    if (direction !== 'LONG' && direction !== 'SHORT') {
      audit.invalidDirection.push({ line: row.__line, tradeId, symbol: row.symbol, yon: row.yon });
      continue;
    }
    if (!Number.isFinite(net)) {
      audit.invalidNet.push({ line: row.__line, tradeId, symbol: row.symbol, netKarZarar: row.netKarZarar });
      continue;
    }

    addToSummary(audit.GENEL, result, net, commission);
    addToSummary(audit[direction], result, net, commission);

    const suspicious =
      (result === 'TP' && net <= 0) ||
      (result === 'SL' && net >= 0) ||
      (result === 'BE' && Math.abs(net) > 0.25);

    if (suspicious) {
      audit.signConflicts.push({
        line: row.__line,
        zaman: row.zaman,
        tradeId,
        symbol: row.symbol,
        yon: direction,
        sonuc: result,
        netKarZarar: net,
        komisyon: commission,
        kapanisSebebi: row.kapanisSebebi
      });
    }
  }

  const orphanOpenings = openings.filter(row => {
    const records = byTradeId.get(String(row.tradeId)) || [];
    return records.length === 1 && !activeIds.has(String(row.tradeId));
  });

  const activeMissingJsonl = activePositions.filter(p => !byTradeId.has(String(p.tradeId)));
  const singleRecordTrades = [...byTradeId.values()].filter(v => v.length === 1).length;

  console.log('============================================================');
  console.log('AGROS v3.6.0 - SALT OKUNUR MUHASEBE DENETIMI');
  console.log('============================================================');
  console.log(`State : ${stateFile}`);
  console.log(`JSONL : ${jsonlFile}`);
  console.log(`State boyutu : ${stateStat.size} bayt`);
  console.log(`JSONL boyutu : ${jsonlStat.size} bayt`);
  console.log('Yazma / onarim: KAPALI');

  console.log('\n=== DOSYA VE KAYIT YAPISI ===');
  console.log(`JSONL dolu satir      : ${rawLines.length}`);
  console.log(`Gecerli JSON kaydi    : ${rows.length}`);
  console.log(`Gecersiz JSON         : ${invalidJson.length}`);
  console.log(`Acilis                 : ${openings.length}`);
  console.log(`Kapanis                : ${closings.length}`);
  console.log(`Benzersiz tradeId      : ${byTradeId.size}`);
  console.log(`Tek kayitli trade      : ${singleRecordTrades}`);
  console.log(`Aktif pozisyon         : ${activePositions.length}`);
  console.log(`Yetim acilis           : ${orphanOpenings.length}`);
  console.log(`Aktif ama JSONL yok    : ${activeMissingJsonl.length}`);
  console.log(`Kayit tipi dagilimi    : ${JSON.stringify(countBy(rows, 'kayitTipi'))}`);
  console.log(`Sonuc dagilimi         : ${JSON.stringify(countBy(closings, 'sonuc'))}`);

  printSummary('GENEL', audit.GENEL);
  printSummary('LONG', audit.LONG);
  printSummary('SHORT', audit.SHORT);

  console.log('\n=== MATEMATIK KONTROLU ===');
  const sideTotal = audit.LONG.net + audit.SHORT.net;
  const netDifference = audit.GENEL.net - sideTotal;
  console.log(`LONG + SHORT : ${money(sideTotal)} USDT`);
  console.log(`GENEL        : ${money(audit.GENEL.net)} USDT`);
  console.log(`Fark         : ${money(netDifference)} USDT`);
  console.log(`Sonuc        : ${Math.abs(netDifference) < 1e-9 ? 'TUTARLI' : 'HATALI'}`);

  console.log('\n=== GECERLILIK KONTROLLERI ===');
  console.log(`Gecersiz JSON                 : ${invalidJson.length}`);
  console.log(`Gecersiz netKarZarar          : ${audit.invalidNet.length}`);
  console.log(`Gecersiz yon                  : ${audit.invalidDirection.length}`);
  console.log(`Mukerrer kapanis tradeId      : ${audit.duplicateClosingIds.length}`);
  console.log(`Sonuc/net isareti supheleri   : ${audit.signConflicts.length}`);

  console.log('\n=== MUHASEBE KARARI ===');
  const critical = invalidJson.length + audit.invalidNet.length + audit.invalidDirection.length + audit.duplicateClosingIds.length;
  if (critical === 0 && Math.abs(netDifference) < 1e-9) {
    console.log('JSONL kapanis muhasebesi kendi icinde matematiksel olarak TUTARLI.');
    console.log('State ozeti farkliysa hata, state ozetinin guncellenmesi/raporlanmasi katmanindadir.');
  } else {
    console.log('JSONL kapanis muhasebesinde kritik tutarsizlik bulundu.');
  }

  if (audit.signConflicts.length) {
    console.log('\n=== SONUC / NET ISARETI SUPHELI ILK 30 KAYIT ===');
    console.log(JSON.stringify(audit.signConflicts.slice(0, 30), null, 2));
  }

  if (orphanOpenings.length) {
    console.log('\n=== YETIM ACILIS ILK 35 KAYIT ===');
    console.log(JSON.stringify(orphanOpenings.slice(0, 35).map(row => ({
      line: row.__line,
      zaman: row.zaman,
      tradeId: row.tradeId,
      symbol: row.symbol,
      yon: row.yon,
      sonuc: row.sonuc
    })), null, 2));
  }

  console.log('\n=== SANAL-STATE MUHASEBE ADAY ALANLARI ===');
  const candidates = findStateCandidates(state);
  if (!candidates.length) console.log('Uygun sayisal alan bulunamadi.');
  else candidates.forEach(([key, value]) => console.log(`${key} = ${value}`));

  console.log('\n============================================================');
  console.log('DENETIM TAMAMLANDI - HICBIR DOSYA DEGISTIRILMEDI');
  console.log('============================================================');
}

try {
  main();
} catch (error) {
  console.error('\n[ACCOUNTING AUDIT HATASI]');
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
