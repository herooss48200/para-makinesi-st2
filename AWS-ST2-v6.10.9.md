# AGROS ST2 v6.10.9 — FINAL ENTRY/EXIT BINDING & NET PROFIT

- Çalışan AWS v6.10.5 açık gerçek pozisyon kapanmadan güncellenmez.
- Paket `.env`, `data`, state, ledger, log, `.git` ve `node_modules` içermez.
- Dağıtımda mevcut AWS `data/` korunur; öğrenilmiş Entry/Exit profilleri silinmez.
- Her yeni ST2 Renko pozisyonu açılışta tek Entry kararı ve pozisyona özel tek Exit trail ataması alır.
- Mevcut profile ait `activeTrail` ilk pozisyonda hemen kullanılır; N5 yalnız yeni değer terfisidir.
