# AGROS v4.4.1 — League Recovery Repair

- RAM güvenliği çalışması sırasında `scorePlayer()` içine taşınan kapsam dışı `tradeGroups` erişimi kaldırıldı.
- `tradeGroups is not defined` nedeniyle yarıda kalan Intelligence/League model üretimi onarıldı.
- Mevcut öğrenilmiş kapanışlar yeniden analiz edilerek Premier, Championship, Development ve Historical ligleri tekrar oluşturulur.
- Worst-10 rolling-5 değerlendirmesi `buildPlayers()` içindeki geçerli trade grupları üzerinden çalışmaya devam eder.
- Açılış, Telegram ve Premier Observation sürüm etiketleri v4.4.1 olarak güncellendi.
- Muhasebe, Replay, Exit Evolution, kalıcı hafıza ve mevcut pozisyon verilerine dokunulmadı.
