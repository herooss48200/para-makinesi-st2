# AWS Deploy — R24.2

1. GitHub/yerel ST2 clean ve aynı commit olmalı.
2. R24.2 tam kaynak veya commit uygulanmalı.
3. `npm run test:fast` çalıştırılmalı.
4. `node test_v6168_r242_unified_execution_stop_authority.js` geçmeli.
5. AWS pull sonrası testler tekrar çalıştırılmalı.
6. PM2 restart sonrası ilk YENİ gerçek ve ana Shadow/Development yaşamlarında `SL -%2.50` doğrulanmalı.
7. R24.2 öncesi açık pozisyonlar kendi frozen stoplarıyla kalabilir; yeni cohort ile karıştırılmamalı.
