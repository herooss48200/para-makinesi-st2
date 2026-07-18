/** AGROS v4.3.0 - STRICT THREE-LAYER PERFORMANCE OBSERVATION */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const league = require('./46_dna_league_engine.js');
const dynamicExit = require('./47_dynamic_dna_exit_engine.js');
const memorySafeIo = require('./53_memory_safe_io.js');

const VERSION = 'v4.4.1-LEAGUE-RECOVERY-REPAIR';
const EXPERIMENT_ID = String(ayarlar.premierTestExperimentId || 'DYNAMIC-LEAGUE-EXIT-2026-07-17');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'adaptive-league-observation.json');
const TRADES_FILE = path.join(DATA_DIR, 'adaptive-league-trades.jsonl');
const REAL_STATE_FILE = path.join(DATA_DIR, 'real-trading-performance.json');
const REAL_TRADES_FILE = path.join(DATA_DIR, 'real-trading-trades.jsonl');

const n = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const ensure = () => { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); };
function bucket() { return { opened: 0, closed: 0, tp: 0, sl: 0, be: 0, net: 0, grossProfit: 0, grossLoss: 0, commission: 0 }; }
function blank(kind = 'LEAGUE_TEST') {
    return {
        version: VERSION,
        kind,
        experimentId: kind === 'REAL_TRADING' ? 'REAL-TRADING-LIFETIME' : EXPERIMENT_ID,
        startedAt: new Date().toISOString(),
        opened: 0,
        closed: 0,
        blocked: 0,
        blockedRaw: 0,
        blockedByReason: {},
        recentBlocked: {},
        premier: bucket(),
        championship: bucket(),
        shadow: bucket(),
        byDna: {},
        byExit: {},
        lastTrades: [],
        updatedAt: null
    };
}
function normalize(x, kind) {
    const out = Object.assign(blank(kind), x || {});
    out.kind = kind;
    out.premier = Object.assign(bucket(), x?.premier || {});
    out.championship = Object.assign(bucket(), x?.championship || {});
    out.shadow = Object.assign(bucket(), x?.shadow || {});
    out.byDna = x?.byDna || {};
    out.byExit = x?.byExit || {};
    out.blockedByReason = x?.blockedByReason || {};
    out.recentBlocked = x?.recentBlocked || {};
    out.lastTrades = x?.lastTrades || [];
    return out;
}
function archiveOld() {
    ensure();
    try {
        const old = memorySafeIo.readJsonBounded(STATE_FILE, null, { maxBytes: 32 * 1024 * 1024 });
        if (old?.experimentId === EXPERIMENT_ID) return;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        if (fs.existsSync(STATE_FILE)) fs.renameSync(STATE_FILE, path.join(DATA_DIR, `adaptive-league-observation.before-${EXPERIMENT_ID}.${stamp}.json`));
        if (fs.existsSync(TRADES_FILE)) fs.renameSync(TRADES_FILE, path.join(DATA_DIR, `adaptive-league-trades.before-${EXPERIMENT_ID}.${stamp}.jsonl`));
    } catch (_) {}
}
function readFile(file, kind) {
    ensure();
    try { return normalize(memorySafeIo.readJsonBounded(file, null, { maxBytes: 32 * 1024 * 1024 }), kind); }
    catch (_) { return blank(kind); }
}
function read() { archiveOld(); const x = readFile(STATE_FILE, 'LEAGUE_TEST'); return x?.experimentId === EXPERIMENT_ID ? x : blank('LEAGUE_TEST'); }
function readReal() { return readFile(REAL_STATE_FILE, 'REAL_TRADING'); }
function writeFile(file, x) { ensure(); const t = file + '.tmp'; fs.writeFileSync(t, JSON.stringify(x, null, 2)); fs.renameSync(t, file); }
function appendFile(file, x) { ensure(); fs.appendFileSync(file, JSON.stringify(x) + '\n'); }
function signature(pos) { return pos?.dnaLeagueProfile?.key || pos?.blackboxAcilis?.strategySignature?.key || ''; }
function trackFor(lig) { if (lig === 'PREMIER') return 'PREMIER'; if (lig === 'CHAMPIONSHIP') return 'CHAMPIONSHIP'; return 'SHADOW'; }
function bucketFor(st, track) { return track === 'PREMIER' ? st.premier : track === 'CHAMPIONSHIP' ? st.championship : st.shadow; }
function storeFor(pos) {
    const real = pos?.sanal === false;
    return real
        ? { kind: 'REAL_TRADING', stateFile: REAL_STATE_FILE, tradesFile: REAL_TRADES_FILE, read: readReal }
        : { kind: 'LEAGUE_TEST', stateFile: STATE_FILE, tradesFile: TRADES_FILE, read };
}
function snapshot(pos) {
    if (!pos || ayarlar.premierObservationAktif === false) return null;
    const key = signature(pos);
    const player = league.findPlayer(key);
    const selected = dynamicExit.selectForPosition(pos) || null;
    const lig = player?.league || pos?.gercekLig || 'UNRANKED';
    const track = trackFor(lig);
    const storage = storeFor(pos);
    const obs = {
        version: VERSION,
        performanceLayer: storage.kind,
        key: key || 'SIGNATURE_YOK',
        leagueAtOpen: lig,
        qualifiedAtOpen: track !== 'SHADOW',
        learningTrack: track,
        leagueScore: n(player?.leagueScore),
        expectancy: n(player?.expectancy),
        profitFactor: n(player?.profitFactor),
        confidence: n(player?.confidence),
        regime: selected?.currentRegime || null,
        exit: selected,
        openedAt: new Date().toISOString()
    };
    pos.premierObservation = obs;
    const st = storage.read();
    st.opened++;
    bucketFor(st, track).opened++;
    st.byDna[obs.key] = st.byDna[obs.key] || { ...bucket(), key: obs.key, lastLeague: obs.leagueAtOpen, lastExit: selected?.selectedAlgorithmId || 'ACTUAL' };
    st.byDna[obs.key].opened++;
    st.byDna[obs.key].lastLeague = obs.leagueAtOpen;
    st.byDna[obs.key].lastExit = selected?.selectedAlgorithmId || 'ACTUAL';
    const exitId = selected?.selectedAlgorithmId || 'ACTUAL';
    st.byExit[exitId] = st.byExit[exitId] || { ...bucket(), algorithmId: exitId, label: selected?.selectedAlgorithmLabel || 'Mevcut Kademe Sistemi' };
    st.byExit[exitId].opened++;
    st.updatedAt = obs.openedAt;
    writeFile(storage.stateFile, st);
    return obs;
}
function apply(b, outcome, net, commission) {
    b.closed++; b.net += net; b.commission += commission;
    if (net > 0) b.grossProfit += net; else if (net < 0) b.grossLoss += Math.abs(net);
    if (outcome === 'TP') b.tp++; else if (outcome === 'BE') b.be++; else b.sl++;
}
function close(pos, result = {}) {
    const obs = pos?.premierObservation;
    if (!obs) return null;
    const storage = obs.performanceLayer === 'REAL_TRADING' || pos?.sanal === false
        ? { kind: 'REAL_TRADING', stateFile: REAL_STATE_FILE, tradesFile: REAL_TRADES_FILE, read: readReal }
        : { kind: 'LEAGUE_TEST', stateFile: STATE_FILE, tradesFile: TRADES_FILE, read };
    const net = n(result.net), commission = n(result.commission), outcome = String(result.outcome || 'SL').toUpperCase();
    const exitId = obs.exit?.selectedAlgorithmId || 'ACTUAL';
    const row = {
        version: VERSION, performanceLayer: storage.kind, experimentId: storage.kind === 'REAL_TRADING' ? 'REAL-TRADING-LIFETIME' : EXPERIMENT_ID,
        closedAt: new Date().toISOString(), openedAt: obs.openedAt, symbol: pos.sym, direction: pos.yon,
        key: obs.key, track: obs.learningTrack, leagueAtOpen: obs.leagueAtOpen, leagueScore: obs.leagueScore,
        confidence: obs.confidence, regime: obs.regime, exitAlgorithmId: exitId,
        exitAlgorithmLabel: obs.exit?.selectedAlgorithmLabel || 'Mevcut Kademe Sistemi', exitScope: obs.exit?.selectionScope || 'NONE',
        outcome, net, commission, reason: result.reason || '', entry: n(pos.girisFiyati), exitPrice: n(result.exitPrice),
        mfePct: n(pos?.sanalDynamicExit?.mfePct || pos?.exitReplay?.mfePct), capturePct: n(result.capturePct || pos?.sanalDynamicExit?.capturePct),
        dualLayerAudit: {
            singlePosition: pos?.dualLayerAudit?.singlePosition === true,
            learningLayerRecorded: true,
            leaguePerformanceRecorded: true,
            track: obs.learningTrack
        }
    };
    const st = storage.read();
    st.closed++;
    apply(bucketFor(st, obs.learningTrack), outcome, net, commission);
    st.byDna[obs.key] = st.byDna[obs.key] || { ...bucket(), key: obs.key, lastLeague: obs.leagueAtOpen, lastExit: exitId };
    apply(st.byDna[obs.key], outcome, net, commission);
    st.byDna[obs.key].lastLeague = obs.leagueAtOpen;
    st.byDna[obs.key].lastExit = exitId;
    st.byExit[exitId] = st.byExit[exitId] || { ...bucket(), algorithmId: exitId, label: row.exitAlgorithmLabel };
    apply(st.byExit[exitId], outcome, net, commission);
    st.lastTrades = [row, ...(st.lastTrades || [])].slice(0, 100);
    st.updatedAt = row.closedAt;
    writeFile(storage.stateFile, st);
    appendFile(storage.tradesFile, row);
    return row;
}
function metrics(b = {}) {
    const decided = n(b.tp) + n(b.sl);
    return { ...b, winRate: decided ? 100 * n(b.tp) / decided : 0, profitFactor: n(b.grossLoss) > 0 ? n(b.grossProfit) / n(b.grossLoss) : (n(b.grossProfit) > 0 ? 999 : 0), expectancy: n(b.closed) ? n(b.net) / n(b.closed) : 0 };
}
function blocked(key, reason = 'TEST_HAVUZU_DISI', context = {}) {
    const st = read(); const now = Date.now(); st.blockedRaw = n(st.blockedRaw) + 1;
    const fingerprint = `${String(context.symbol || '')}|${String(context.side || '')}|${key}|${reason}`;
    const dedupeMs = Math.max(60000, n(ayarlar.premierBlockedDedupeMs, 15 * 60 * 1000));
    const last = n(st.recentBlocked?.[fingerprint]); const counted = !last || now - last >= dedupeMs;
    if (counted) { st.blocked = n(st.blocked) + 1; st.blockedByReason[reason] = n(st.blockedByReason[reason]) + 1; }
    st.recentBlocked = st.recentBlocked || {}; st.recentBlocked[fingerprint] = now;
    for (const [k, v] of Object.entries(st.recentBlocked)) if (now - n(v) > 24 * 60 * 60 * 1000) delete st.recentBlocked[k];
    st.updatedAt = new Date(now).toISOString(); writeFile(STATE_FILE, st); return { key, reason, counted, experimentId: EXPERIMENT_ID };
}
function activeRows(active = [], kind = 'LEAGUE_TEST') {
    return active.map(x => {
        const o = x?.premierObservation; if (!o) return null;
        const layer = o.performanceLayer || (x?.sanal === false ? 'REAL_TRADING' : 'LEAGUE_TEST');
        if (layer !== kind) return null;
        return { symbol: x.sym, direction: x.yon, key: o.key, track: o.learningTrack, league: o.leagueAtOpen, score: o.leagueScore, exit: o.exit?.selectedAlgorithmLabel || 'Mevcut Kademe' };
    }).filter(Boolean);
}
function buildModel(st, active, kind) {
    // Ayrıntılı model yalnız konsol/inceleme çağrılarında kullanılır. Büyük lig modeli ve
    // sıralı DNA dizileri Telegram rapor yolunda üretilmez.
    let leagueModel = null; try { leagueModel = league.build ? league.build() : null; } catch (_) {}
    const dnaRows = Object.values(st.byDna || {});
    const exitRows = Object.values(st.byExit || {});
    return {
        ...st,
        premier: metrics(st.premier), championship: metrics(st.championship), shadow: metrics(st.shadow),
        leagueSizes: leagueModel?.leagueSizes || {}, active: activeRows(active, kind),
        topDna: dnaRows.map(metrics).sort((a,b)=>b.net-a.net||b.opened-a.opened),
        topActiveDna: dnaRows.map(metrics).sort((a,b)=>b.opened-a.opened||b.net-a.net),
        topExit: exitRows.map(metrics).sort((a,b)=>b.net-a.net)
    };
}
function buildSummaryModel(st, active, kind) {
    // Telegram için gereken alanlar tek geçişte hazırlanır. league.build(), Object.values,
    // map ve sort yoktur; böylece büyük DNA/exit kayıtları kopyalanmaz.
    return {
        version: st.version,
        kind: st.kind,
        experimentId: st.experimentId,
        startedAt: st.startedAt,
        opened: n(st.opened), closed: n(st.closed), blocked: n(st.blocked),
        premier: metrics(st.premier), championship: metrics(st.championship), shadow: metrics(st.shadow),
        active: activeRows(active, kind), updatedAt: st.updatedAt
    };
}
function model(active = []) { return buildModel(read(), active, 'LEAGUE_TEST'); }
function realModel(active = []) { return buildModel(readReal(), active, 'REAL_TRADING'); }
function summaryModel(active = []) { return buildSummaryModel(read(), active, 'LEAGUE_TEST'); }
function realSummaryModel(active = []) { return buildSummaryModel(readReal(), active, 'REAL_TRADING'); }
function combined(m) {
    const p = m.premier, c = m.championship;
    return metrics({ opened: n(p.opened)+n(c.opened), closed: n(p.closed)+n(c.closed), tp:n(p.tp)+n(c.tp), sl:n(p.sl)+n(c.sl), be:n(p.be)+n(c.be), net:n(p.net)+n(c.net), grossProfit:n(p.grossProfit)+n(c.grossProfit), grossLoss:n(p.grossLoss)+n(c.grossLoss), commission:n(p.commission)+n(c.commission) });
}
function line(label, b) { return `${label} | Açılan ${b.opened} | Aktif ${Math.max(0,b.opened-b.closed)} | Kapalı ${b.closed} | Başarı %${b.winRate.toFixed(2)} | Net ${b.net.toFixed(4)} | PF ${b.profitFactor>=999?'∞':b.profitFactor.toFixed(2)} | Exp ${b.expectancy>=0?'+':''}${b.expectancy.toFixed(4)}`; }
function compactTelegramFromModel(m) {
    if (ayarlar.premierObservationTelegramAktif === false) return '';
    const all = combined(m);
    let t = '🧪 <b>ÜST KATMAN SANAL TESTİ</b>\n';
    t += line('🏆 Premier', m.premier) + '\n';
    t += line('🥈 Championship', m.championship) + '\n';
    t += `📊 Birleşik | Açılan ${all.opened} | Kapalı ${all.closed} | Başarı %${all.winRate.toFixed(2)} | Net ${all.net.toFixed(4)} | Kom ${all.commission.toFixed(4)} | PF ${all.profitFactor>=999?'∞':all.profitFactor.toFixed(2)} | Exp ${all.expectancy>=0?'+':''}${all.expectancy.toFixed(4)}\n`;
    if (!all.opened) t += '⏳ İlk uygun Premier/Championship DNA işlemi bekleniyor.';
    return t;
}
function compactTelegram(active = []) { return compactTelegramFromModel(summaryModel(active)); }
function realCompactTelegram(active = []) {
    const m = realSummaryModel(active), all = combined(m);
    let t = '🔴 <b>GERÇEK EMİR PERFORMANSI</b>\n';
    t += `📦 Aktif Binance Pozisyonu ${m.active.length}\n`;
    t += line('🏆 Premier', m.premier) + '\n';
    t += line('🥈 Championship', m.championship) + '\n';
    t += `💰 Gerçek Birleşik | Açılan ${all.opened} | Kapalı ${all.closed} | Başarı %${all.winRate.toFixed(2)} | Net ${all.net.toFixed(4)} | Kom ${all.commission.toFixed(4)} | PF ${all.profitFactor>=999?'∞':all.profitFactor.toFixed(2)} | Exp ${all.expectancy>=0?'+':''}${all.expectancy.toFixed(4)}\n`;
    t += all.opened ? '✅ Bu kasa yalnızca Binance’e gerçekten iletilen emirlerden oluşur.' : '⏳ Henüz Binance’e iletilmiş gerçek emir yok.';
    return t;
}
function telegramFromModel(m) {
    const all = combined(m);
    let t = '\n\n💎 <b>DYNAMIC LEAGUE + EXIT TEST KASASI</b>\n';
    t += `🧪 Deney: ${m.experimentId} | Başlangıç: ${m.startedAt}\n`;
    t += line('🏆 Premier', m.premier) + '\n' + line('🥈 Championship', m.championship) + '\n';
    t += `📊 Birleşik test | Açılan ${all.opened} | Kapalı ${all.closed} | Başarı %${all.winRate.toFixed(2)} | Net ${all.net.toFixed(4)} | Kom ${all.commission.toFixed(4)} | PF ${all.profitFactor>=999?'∞':all.profitFactor.toFixed(2)} | Exp ${all.expectancy.toFixed(4)}\n`;
    t += '🔒 Bu kasa sanal üst katman testidir; öğrenme ve gerçek emir kasasına karışmaz.';
    return t;
}
function telegram(active = []) { return telegramFromModel(summaryModel(active)); }
module.exports = { VERSION, EXPERIMENT_ID, STATE_FILE, TRADES_FILE, REAL_STATE_FILE, REAL_TRADES_FILE, read, readReal, blocked, snapshot, close, model, realModel, summaryModel, realSummaryModel, __testBuildSummaryModel: buildSummaryModel, compactTelegramFromModel, telegramFromModel, compactTelegram, realCompactTelegram, telegram };
