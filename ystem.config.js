warning: in the working copy of 'package.json', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/package.json b/package.json[m
[1mindex bc793e5..40c838e 100644[m
[1m--- a/package.json[m
[1m+++ b/package.json[m
[36m@@ -1,11 +1,11 @@[m
 {[m
   "name": "para-makinesi-binance",[m
[31m-  "version": "3.5.3-fix.1",[m
[32m+[m[32m  "version": "3.6.1",[m
   "description": "Binance Futures üzerinde çalışan Telegram raporlamalı modüler Node.js işlem botu.",[m
   "main": "bot.js",[m
   "scripts": {[m
     "start": "node bot.js",[m
[31m-    "check": "node --check bot.js && node --check 1_hafiza.js && node --check 2_rapor.js && node --check 3_piyasa.js && node --check 4_pozisyon.js && node --check 5_kalici_hafiza.js && node --check ayarlar.js && node --check motor.js && node --check revizyon.js && node --check versiyon.js && node --check 6_pusu_kalite_motoru.js && node --check 8_blackbox.js && node --check 9_feature_importance_lab.js && node --check 10_pair_importance_lab.js && node --check 11_triple_dna_lab.js && node --check 12_confidence_engine.js && node --check 13_live_intelligence_monitor.js && node --check 14_intelligence_console.js && node --check 15_exit_optimizer_foundation.js && node --check 16_success_cluster_engine.js && node --check 17_cluster_intelligence_engine.js && node --check 18_similarity_learning_core.js && node --check 19_position_sizing_audit.js && node --check 20_learning_validation.js"[m
[32m+[m[32m    "check": "node --check bot.js && node --check 1_hafiza.js && node --check 2_rapor.js && node --check 3_piyasa.js && node --check 4_pozisyon.js && node --check 5_kalici_hafiza.js && node --check ayarlar.js && node --check motor.js && node --check revizyon.js && node --check versiyon.js && node --check 6_pusu_kalite_motoru.js && node --check 8_blackbox.js && node --check 9_feature_importance_lab.js && node --check 10_pair_importance_lab.js && node --check 11_triple_dna_lab.js && node --check 12_confidence_engine.js && node --check 13_live_intelligence_monitor.js && node --check 14_intelligence_console.js && node --check 15_exit_optimizer_foundation.js && node --check 16_success_cluster_engine.js && node --check 17_cluster_intelligence_engine.js && node --check 18_similarity_learning_core.js && node --check 19_position_sizing_audit.js && node --check 20_learning_validation.js && node --check 21_accounting_audit.js && node --check 22_exit_replay_engine.js"[m
   },[m
   "dependencies": {[m
     "axios": "^1.13.2",[m
