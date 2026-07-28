'use strict';

const VERSION = 'v6.3.7-STABLE-PUSU-NOTIFICATION-DEDUPE';

function temizle(store, options = {}) {
    const map = store?.pusuTelegramBildirimleri || {};
    const now = Number(options.now || Date.now());
    const ttlHours = Math.max(24, Number(options.ttlHours || 168));
    const ttlMs = ttlHours * 60 * 60 * 1000;
    const maxEntries = Math.max(1000, Number(options.maxEntries || 5000));
    let removed = 0;

    for (const [key, ts] of Object.entries(map)) {
        if (!Number.isFinite(Number(ts)) || now - Number(ts) > ttlMs) {
            delete map[key];
            removed++;
        }
    }

    const rows = Object.entries(map);
    if (rows.length > maxEntries) {
        rows.sort((a, b) => Number(a[1]) - Number(b[1]));
        for (const [key] of rows.slice(0, rows.length - maxEntries)) {
            delete map[key];
            removed++;
        }
    }
    return removed;
}

module.exports = { VERSION, temizle };
