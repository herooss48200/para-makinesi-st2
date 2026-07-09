AGROS Strategy Lab v3.2.0 - BlackBox Report Model

İçerik:
- 8_blackbox.js

Değişiklik özeti:
- Telegram özet ve istatistik raporları için blackboxReportModelOlustur() eklendi.
- renderIstatistikRaporu() ve renderOzetRaporu() eklendi.
- Mevcut telegramIstatistikRaporMetni() ve telegramOzetMetni() davranışı korunarak yeni model katmanından render edilecek hale getirildi.
- Trade engine, snapshot, kayıt, Strategy Lab istatistik güncelleme ve emir akışına dokunulmadı.

Kurulum:
1) ZIP içindeki 8_blackbox.js dosyasını repo köküne kopyalayın.
2) Mevcut 8_blackbox.js üzerine yazın.
3) PowerShell:
   node --check .\8_blackbox.js
   git diff -- 8_blackbox.js
   git status

Önerilen commit:
   git add 8_blackbox.js
   git commit -m "v3.2.0 BlackBox report model foundation"
