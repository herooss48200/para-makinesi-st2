const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const APP_ID = 'ST2';
const APP_NAME = 'AGROS ST2';
const PACKAGE_NAME = 'para-makinesi-st2';
const REPO_SLUG = 'para-makinesi-st2';
const PM2_NAME = 'agros-st2';
const DATA_DIR = path.join(ROOT_DIR, 'data');
const LOG_DIR = path.join(ROOT_DIR, 'logs-st2');
const ROOT_MARKER_FILE = path.join(ROOT_DIR, '.agros-st2.json');
const DATA_MARKER_FILE = path.join(DATA_DIR, '.agros-instance');

const EXPECTED_ROOT_MARKER = Object.freeze({
  schema: 1,
  instanceId: APP_ID,
  appName: APP_NAME,
  packageName: PACKAGE_NAME,
  repository: REPO_SLUG,
  dataDirectory: 'data',
  logDirectory: 'logs-st2'
});

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`[ST2 KIMLIK] ${path.basename(file)} okunamadi: ${err.message}`);
  }
}

function assertInsideRoot(target, label) {
  const relative = path.relative(ROOT_DIR, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`[ST2 KIMLIK] ${label} uygulama kokunun disinda olamaz: ${target}`);
  }
}

function assertNotSymlink(target, label) {
  if (!fs.existsSync(target)) return;
  if (fs.lstatSync(target).isSymbolicLink()) {
    throw new Error(`[ST2 KIMLIK] ${label} sembolik bag olamaz; ST1/ST2 veri paylasimi yasak: ${target}`);
  }
}

function validateRootMarker() {
  if (!fs.existsSync(ROOT_MARKER_FILE)) {
    throw new Error(`[ST2 KIMLIK] Kok kimlik dosyasi yok: ${ROOT_MARKER_FILE}`);
  }
  const marker = readJson(ROOT_MARKER_FILE);
  for (const [key, expected] of Object.entries(EXPECTED_ROOT_MARKER)) {
    if (marker[key] !== expected) {
      throw new Error(`[ST2 KIMLIK] Kok kimlik uyusmazligi ${key}: beklenen=${expected}, bulunan=${marker[key]}`);
    }
  }
}

function validatePackageIdentity() {
  const packageJson = readJson(path.join(ROOT_DIR, 'package.json'));
  if (packageJson.name !== PACKAGE_NAME) {
    throw new Error(`[ST2 KIMLIK] package.json adi ${PACKAGE_NAME} olmali; bulunan=${packageJson.name}`);
  }
}

function validateEnvironmentIdentity() {
  const configuredId = String(process.env.AGROS_INSTANCE_ID || APP_ID).trim().toUpperCase();
  if (configuredId !== APP_ID) {
    throw new Error(`[ST2 KIMLIK] AGROS_INSTANCE_ID=${configuredId}; ST2 kodu farkli instance ile baslatilamaz.`);
  }

  const configuredRepo = String(process.env.AGROS_REPO_SLUG || REPO_SLUG).trim();
  if (configuredRepo !== REPO_SLUG) {
    throw new Error(`[ST2 KIMLIK] AGROS_REPO_SLUG=${configuredRepo}; beklenen=${REPO_SLUG}.`);
  }

  const configuredData = String(process.env.AGROS_DATA_DIR || 'data').trim();
  if (configuredData !== 'data') {
    throw new Error('[ST2 KIMLIK] Bu surumde AGROS_DATA_DIR yalnizca data olabilir; tum moduller kok/data kullanir.');
  }

  const configuredLog = String(process.env.AGROS_LOG_DIR || 'logs-st2').trim();
  if (configuredLog !== 'logs-st2') {
    throw new Error('[ST2 KIMLIK] AGROS_LOG_DIR logs-st2 olmali.');
  }

  process.env.AGROS_INSTANCE_ID = APP_ID;
  process.env.AGROS_APP_NAME = APP_NAME;
  process.env.AGROS_REPO_SLUG = REPO_SLUG;
  process.env.AGROS_PM2_NAME = PM2_NAME;
  process.env.AGROS_DATA_DIR = 'data';
  process.env.AGROS_LOG_DIR = 'logs-st2';
  process.env.AGROS_TELEGRAM_PREFIX = process.env.AGROS_TELEGRAM_PREFIX || APP_NAME;
}

function validateDataDirectory() {
  assertInsideRoot(DATA_DIR, 'Data klasoru');
  assertInsideRoot(LOG_DIR, 'Log klasoru');
  assertNotSymlink(DATA_DIR, 'Data klasoru');
  assertNotSymlink(LOG_DIR, 'Log klasoru');

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  if (fs.existsSync(DATA_MARKER_FILE)) {
    const marker = String(fs.readFileSync(DATA_MARKER_FILE, 'utf8')).trim().toUpperCase();
    if (marker !== APP_ID) {
      throw new Error(`[ST2 KIMLIK] Data klasoru ${marker || 'BOS'} instance'ina ait; ST2 bu veriyi acamaz.`);
    }
    return;
  }

  const existing = fs.readdirSync(DATA_DIR).filter(name => name !== '.gitkeep');
  if (existing.length > 0 && process.env.AGROS_ST2_ALLOW_DATA_ADOPTION !== 'YES') {
    throw new Error(
      `[ST2 KIMLIK] Kimliksiz dolu data klasoru bulundu (${existing.slice(0, 5).join(', ')}). ` +
      'ST1 verisini yanlislikla kullanmamak icin baslangic engellendi.'
    );
  }
  fs.writeFileSync(DATA_MARKER_FILE, `${APP_ID}\n`, { flag: 'wx' });
}

let validated = false;
function assertRuntimeIdentity() {
  if (validated) return runtimeSummary();
  validateEnvironmentIdentity();
  validateRootMarker();
  validatePackageIdentity();
  validateDataDirectory();
  validated = true;
  return runtimeSummary();
}

function telegramPrefixEkle(message) {
  const text = String(message || '');
  const visiblePrefix = String(process.env.AGROS_TELEGRAM_PREFIX || APP_NAME).trim() || APP_NAME;
  if (text.includes('<b>AGROS ST2</b>') || text.startsWith('AGROS ST2') || text.startsWith('[AGROS ST2]')) return text;
  return `🧪 <b>${visiblePrefix}</b>\n${text}`;
}

function runtimeSummary() {
  return {
    appId: APP_ID,
    appName: APP_NAME,
    packageName: PACKAGE_NAME,
    repoSlug: REPO_SLUG,
    pm2Name: PM2_NAME,
    rootDir: ROOT_DIR,
    dataDir: DATA_DIR,
    logDir: LOG_DIR
  };
}

module.exports = {
  APP_ID,
  APP_NAME,
  PACKAGE_NAME,
  REPO_SLUG,
  PM2_NAME,
  ROOT_DIR,
  DATA_DIR,
  LOG_DIR,
  ROOT_MARKER_FILE,
  DATA_MARKER_FILE,
  assertRuntimeIdentity,
  telegramPrefixEkle,
  runtimeSummary
};
