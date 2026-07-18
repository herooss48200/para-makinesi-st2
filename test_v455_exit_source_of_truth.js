const assert = require('assert');
const fs = require('fs');
const cards = require('./55_dna_identity_card_engine.js');
const league = require('./46_dna_league_engine.js');

const key = 'YON=LONG|BTC=0011|COIN=0010';
const player = {
  key,
  total: 49,
  tp: 36,
  sl: 13,
  be: 0,
  decided: 49,
  winRate: 73.47,
  expectancy: 0.1427,
  profitFactor: 1.68,
  net: 6.9899,
  leagueScore: 100,
  recent5: { total: 5, expectancy: 0.1, profitFactor: 1.2, net: 0.5 },
  momentum: { status: 'GUCLENIYOR' },
  exit: {
    ready: true,
    algorithmId: 'MFE_PROTECT_60',
    algorithmLabel: 'MFE Koruma %60',
    samples: 49,
    regimeKey: 'TREND_UP|VOL_MEDIUM',
    deltaUsdt: 3.2
  },
  pairMetrics: {
    source: 'DNA_BEST_VALIDATED_EXIT',
    algorithmId: 'MFE_PROTECT_60',
    algorithmLabel: 'MFE Koruma %60',
    total: 49,
    expectancy: 0.2,
    profitFactor: 2.1,
    net: 9.8,
    beatRate: 70
  }
};

const lm = {
  leagues: { premier: [player], championship: [], development: [], historical: [] }
};
const dm = {
  currentRegime: { key: 'TREND_UP|VOL_MEDIUM' },
  dna: [{
    key,
    allBest: {
      algorithmId: 'TIME_10M',
      algorithmLabel: '10 Dakika Exit',
      samples: 38,
      deltaUsdt: 4.5
    }
  }]
};

const original = fs.existsSync(cards.OUT) ? fs.readFileSync(cards.OUT) : null;
try {
  const out = cards.build(lm, dm);
  const card = out.cards[0];
  assert.strictEqual(card.activeExit, 'MFE Koruma %60');
  assert.strictEqual(card.activeExitSamples, 49);
  assert.strictEqual(card.activeExitRegime, 'TREND_UP|VOL_MEDIUM');
  assert.strictEqual(card.eliteExit, '10 Dakika Exit');
  assert.strictEqual(card.eliteExitSamples, 38);
  assert.strictEqual(card.eliteDiffersFromActive, true);
  const text = cards.telegram(out, 1);
  assert.ok(text.includes('Aktif Exit (TREND_UP|VOL_MEDIUM): MFE Koruma %60 | ExitN49'));
  assert.ok(text.includes('Tüm Dönem Elite: 10 Dakika Exit | EliteN38'));

  const leagueModel = {
    regime: { activeDirection: 'LONG', long: { expectancy: 0.1 }, short: { expectancy: -0.1 } },
    leagueSizes: { premier: 1, championship: 0, development: 0, historical: 0 },
    worstTenCount: 0,
    lastTransferTradeCount: 10,
    nextTransferAt: 15,
    leagues: { premier: [player], championship: [], development: [], historical: [] },
    transfers: [],
    audit: { profitableCount: 1, profitableOutsidePremierCount: 0, rule: 'TEST' }
  };
  const leagueText = league.telegramText(leagueModel, { limit: 1 });
  assert.ok(leagueText.includes('DNA N49'));
  assert.ok(leagueText.includes('ExitN49'), 'Dinamik exit örneği DNA N ile eşit olsa da gizlenmemeli');
  console.log('✅ v4.5.5 exit source-of-truth tests passed | Active regime exit and all-time Elite separated');
} finally {
  if (original) fs.writeFileSync(cards.OUT, original);
  else if (fs.existsSync(cards.OUT)) fs.unlinkSync(cards.OUT);
}
