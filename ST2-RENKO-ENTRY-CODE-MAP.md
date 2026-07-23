# AGROS ST2 Renko Entry — Code Map

## Certified source
- ST1 version: 5.4.2-ST1-REPORT-CONSISTENCY-FIX
- Declared source commit: 690e0bf
- Declared source fingerprint: 3014c4df6a764d9a

## Existing ST1 matches
- Bollinger proximity setting: `ayarlar.proximityYuzdesi`
- Bollinger period/multiplier: `ayarlar.bollingerperiod`, `ayarlar.bollingercarpani`
- Proximity/touch/pass calculation: `motor.pusuSenaryosuTespit`
- ST1 ambush creation: `4_pozisyon.piyasayiTaraVePusuKur`
- ST1 trigger buffer: `ayarlar.tetikYuzdesi`
- ST1 trigger evaluation/live price recheck: `4_pozisyon.pusulariDenetleVeIslemAc`
- Order opening boundary: `motor.pozisyonAc`
- ST1 wait limit: `ayarlar.maxPusuBeklemeMum`
- Entry diagnostics and learning carrier: `girisAnalizi`

## ST2 additions
- Pure ATR/Renko/state helpers: `72_st2_renko_core.js`
- Runtime Renko state machine: `72_st2_renko_entry.js`
- Runtime state: `h.state.st2Renko`
- Mode switch: `ayarlar.entryStrategyMode`
- Renko settings: `renkoKaynakPeriyodu`, `renkoAtrPeriod`, `renkoTetikYuzdesi`, `maxPusuBeklemeTugla`
- Bot routing: `bot.js` calls ST2 entry only when `entryStrategyMode === 'ST2_RENKO'`
- Mandatory identity: `girisAnalizi.entryStrategy` and top-level prepared identity `entryStrategy`

## Preserved boundaries
Trade Engine, order sizing, stop, BE, Exit Engine, Premier League, DNA learning, accounting, commission and live portfolio reconciliation remain on the existing path after `motor.pozisyonAc`.
