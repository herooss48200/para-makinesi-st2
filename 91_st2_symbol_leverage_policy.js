'use strict';

function invalidLeverageError(err) {
  const text = String(err?.message || err || '');
  return /leverage\s+\d+\s+is\s+not\s+valid/i.test(text) || /invalid leverage/i.test(text) || /-4028/.test(text);
}

async function negotiate({ symbol, requestedLeverage, client, allowFallback = true }) {
  const requested = Math.floor(Number(requestedLeverage));
  if (!(requested >= 1) || !client || typeof client.futuresLeverage !== 'function') {
    throw new Error('KALDIRAC_POLITIKASI_GECERSIZ');
  }
  const attempts = [];
  const minLeverage = allowFallback === true ? 1 : requested;
  for (let leverage = requested; leverage >= minLeverage; leverage--) {
    try {
      const response = await client.futuresLeverage({ symbol, leverage });
      const confirmed = Math.floor(Number(response?.leverage));
      if (confirmed === leverage) return { requested, effective: leverage, response, attempts };
      attempts.push({ leverage, reason: `DOGRULAMA_${confirmed || 'YOK'}` });
    } catch (err) {
      attempts.push({ leverage, reason: String(err?.message || err || 'HATA') });
      if (!invalidLeverageError(err)) throw err;
    }
  }
  const error = new Error(allowFallback === true
    ? `SEMBOL_KALDIRAC_UYUMLU_DEGIL:${symbol}:${requested}->1`
    : `SEMBOL_KALDIRAC_DOGRULANAMADI:${symbol}:${requested}x`);
  error.attempts = attempts;
  throw error;
}

module.exports = { invalidLeverageError, negotiate };
