/** AGROS v4.4.6 - Memory-safe JSON/JSONL helpers. */
const fs = require('fs');
const path = require('path');

function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonBounded(file, fallback = null, options = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const maxBytes = Math.max(1024, Number(options.maxBytes || 32 * 1024 * 1024));
    const size = fs.statSync(file).size;
    if (size > maxBytes) {
      if (options.archiveOversize) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archive = `${file}.oversize-${stamp}.bak`;
        fs.renameSync(file, archive);
        console.warn(`🛡️ [RAM-SAFE JSON] Büyük dosya arşivlendi | ${path.basename(file)} | ${(size / 1048576).toFixed(1)} MB | ${path.basename(archive)}`);
        return typeof options.onArchived === 'function' ? options.onArchived(archive, size) : fallback;
      }
      console.warn(`🛡️ [RAM-SAFE JSON] Büyük dosya yüklenmedi | ${path.basename(file)} | ${(size / 1048576).toFixed(1)} MB`);
      return fallback;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`⚠️ [RAM-SAFE JSON] ${path.basename(file)} okunamadı: ${err.message}`);
    return fallback;
  }
}

function forEachJsonlSync(file, onRow, options = {}) {
  if (!fs.existsSync(file)) return { rows: 0, invalid: 0, oversized: 0 };
  const chunkBytes = Math.max(4096, Number(options.chunkBytes || 256 * 1024));
  const maxLineBytes = Math.max(1024, Number(options.maxLineBytes || 16 * 1024 * 1024));
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(chunkBytes);
  let carry = '';
  let offset = 0;
  let rows = 0;
  let invalid = 0;
  let oversized = 0;
  let discardOversizedLine = false;

  function parseLine(line) {
    if (!line.trim()) return;
    if (Buffer.byteLength(line, 'utf8') > maxLineBytes) {
      invalid++;
      oversized++;
      return;
    }
    try { onRow(JSON.parse(line)); rows++; } catch (_) { invalid++; }
  }

  try {
    const size = fs.fstatSync(fd).size;
    while (offset < size) {
      const length = Math.min(chunkBytes, size - offset);
      const read = fs.readSync(fd, buffer, 0, length, offset);
      if (!read) break;
      offset += read;
      let text = buffer.toString('utf8', 0, read);

      // Tek bir bozuk/aşırı büyük JSON satırı da carry alanını sınırsız büyütmesin.
      if (discardOversizedLine) {
        const newline = text.indexOf('\n');
        if (newline < 0) continue;
        text = text.slice(newline + 1);
        discardOversizedLine = false;
      }

      const parts = (carry + text).split(/\r?\n/);
      carry = parts.pop() || '';
      for (const line of parts) parseLine(line);

      if (Buffer.byteLength(carry, 'utf8') > maxLineBytes) {
        carry = '';
        invalid++;
        oversized++;
        discardOversizedLine = true;
      }
    }
    if (!discardOversizedLine && carry.trim()) parseLine(carry);
  } finally {
    fs.closeSync(fd);
  }
  return { rows, invalid, oversized };
}

function readJsonlTailSync(file, limit = 100, options = {}) {
  const wanted = Math.max(0, Number(limit || 0));
  if (!wanted || !fs.existsSync(file)) return [];
  const maxScanBytes = Math.max(4096, Number(options.maxScanBytes || 8 * 1024 * 1024));
  const chunkBytes = Math.max(4096, Number(options.chunkBytes || 128 * 1024));
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    let position = size;
    let scanned = 0;
    let text = '';
    while (position > 0 && scanned < maxScanBytes) {
      const length = Math.min(chunkBytes, position, maxScanBytes - scanned);
      position -= length;
      const buffer = Buffer.allocUnsafe(length);
      fs.readSync(fd, buffer, 0, length, position);
      text = buffer.toString('utf8') + text;
      scanned += length;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length >= wanted + 1 || position === 0) break;
    }
    const lines = text.split(/\r?\n/).filter(Boolean).slice(-wanted);
    const out = [];
    for (const line of lines) {
      try { out.push(JSON.parse(line)); } catch (_) {}
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

function writeJsonAtomic(file, value) {
  ensureDir(file);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

function ramMb() {
  const m = process.memoryUsage();
  return { rss: Number((m.rss / 1048576).toFixed(1)), heapUsed: Number((m.heapUsed / 1048576).toFixed(1)), heapTotal: Number((m.heapTotal / 1048576).toFixed(1)) };
}

module.exports = { readJsonBounded, forEachJsonlSync, readJsonlTailSync, writeJsonAtomic, ramMb };
