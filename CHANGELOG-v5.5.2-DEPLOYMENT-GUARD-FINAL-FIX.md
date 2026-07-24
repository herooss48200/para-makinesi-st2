# AGROS ST2 v5.5.2 — Deployment Guard Final Fix

- `70_deployment_fingerprint.js` now validates the active ST2 package version `5.5.2-st2.0`.
- Bot identity validation now expects `5.5.2-ST2-RENKO-9-PATTERN`.
- Premier report validation uses the actual Operations Center heading: `PREMIER KARAR VE FORM ÖZETİ`.
- ST1 scientific certification validation is encoding-safe and checks the stable certification title plus `v5.4.1` separately.
- Deployment success output was updated to ST2 v5.5.2.
- UTF-8 source encoding is preserved.

Expected verification command:

```bash
npm ci
npm run verify:st2
```
