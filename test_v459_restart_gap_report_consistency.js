const assert = require('assert');
const fs = require('fs');
const scoreboard = require('./52_exit_method_scoreboard.js');
const version = require('./versiyon.js');

const backup = fs.existsSync(scoreboard.FILE) ? fs.readFileSync(scoreboard.FILE) : null;
try {
  fs.mkdirSync(require('path').dirname(scoreboard.FILE), { recursive: true });
  fs.writeFileSync(scoreboard.FILE, JSON.stringify({
    version: scoreboard.VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalOpened: 4,
    totalClosed: 3,
    methods: {
      TIME_10M: {
        id: 'TIME_10M', label: '10 Dakika Exit', opened: 4, closed: 3,
        tp: 0, sl: 0, be: 3, net: -0.0985, commission: 0.15,
        grossProfit: 0, grossLoss: 0.0985, source: 'ASSIGNED_DYNAMIC'
      }
    }
  }, null, 2));

  const pos = { exitPlanShadow: { ready: true, selectedAlgorithmId: 'TIME_10M', selectedAlgorithmLabel: '10 Dakika Exit' } };
  const before = scoreboard.read();
  const summary = scoreboard.display(pos);
  const text = scoreboard.telegramLine(summary, { restartGap: true, currentOutcome: 'SL' });
  const after = scoreboard.read();

  assert.deepStrictEqual(after, before, 'Restart-gap gösterimi çetele dosyasını değiştirmemeli');
  assert.ok(text.includes('Metot Çetelesi (bu kapanış hariç)'));
  assert.ok(text.includes('muhasebe sonucu: <b>SL</b>'));
  assert.ok(text.includes('HARİÇ (RESTART GAP)'));
  assert.strictEqual(summary.be, 3);
  assert.strictEqual(summary.sl, 0);
  assert.ok(version.botSurumu.startsWith('4.5.9-'));
  console.log('✅ v4.5.9 restart-gap report consistency tests passed');
} finally {
  if (backup) fs.writeFileSync(scoreboard.FILE, backup);
  else if (fs.existsSync(scoreboard.FILE)) fs.unlinkSync(scoreboard.FILE);
}
