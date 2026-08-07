'use strict';

/**
 * AGROS ST2 live panel cadence coordinator.
 *
 * Purpose: keep the 30-second live-panel contract independent from the heavy
 * market/Renko scan control flow. This module never reads or changes trade math.
 */
function createSt2LivePanelScheduler(options = {}) {
    const enabled = typeof options.enabled === 'function' ? options.enabled : () => true;
    const ready = typeof options.ready === 'function' ? options.ready : () => true;
    const intervalMs = typeof options.intervalMs === 'function' ? options.intervalMs : () => 30000;
    const request = typeof options.request === 'function' ? options.request : () => {};
    const onError = typeof options.onError === 'function' ? options.onError : () => {};
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const setIntervalFn = typeof options.setIntervalFn === 'function' ? options.setIntervalFn : setInterval;
    const clearIntervalFn = typeof options.clearIntervalFn === 'function' ? options.clearIntervalFn : clearInterval;

    let timer = null;
    let lastRequestAt = 0;
    let requestCount = 0;

    function normalizedIntervalMs() {
        return Math.max(1000, Number(intervalMs()) || 30000);
    }

    function tick() {
        try {
            if (!enabled() || !ready()) return false;
            const t = Number(now());
            const cadence = normalizedIntervalMs();
            if (lastRequestAt > 0 && t - lastRequestAt < cadence) return false;
            lastRequestAt = t;
            requestCount++;
            try {
                const result = request();
                Promise.resolve(result).catch(onError);
            } catch (err) {
                onError(err);
            }
            return true;
        } catch (err) {
            onError(err);
            return false;
        }
    }

    function start() {
        if (timer) return timer;
        const checkMs = Math.max(500, Math.min(1000, normalizedIntervalMs()));
        timer = setIntervalFn(tick, checkMs);
        timer?.unref?.();
        return timer;
    }

    function stop() {
        if (!timer) return;
        clearIntervalFn(timer);
        timer = null;
    }

    function status() {
        return {
            running: Boolean(timer),
            lastRequestAt,
            requestCount,
            intervalMs: normalizedIntervalMs()
        };
    }

    return { start, stop, tick, status };
}

module.exports = { createSt2LivePanelScheduler };
