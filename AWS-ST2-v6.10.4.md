# AWS Dağıtım — AGROS ST2 v6.10.4

1. Botu durdurun; ARM ve ACK DISABLED olsun.
2. `git pull --ff-only origin live-v6.9.3`
3. `npm ci && npm test`
4. ARM/ACK kapalı smoke test yapın.
5. Operasyon raporunda `Bilimsel Premier` ve `Gerçek Premier` satırlarını doğrulayın.

Beklenen ilk canlı doğrulama:
- SAHARA gibi gerçek kârlı Score-Premier kapanışı sonrası Gerçek Premier N ve ✅ sayacı artar.
- Sanal Premier kapanışları Bilimsel Premier toplamına girer fakat Gerçek Premier satırına girmez.
