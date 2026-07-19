# v4.8.0-fix.1 — Family Report Path Closed

- Family DNA artık yalnız kalıcı hafızadır.
- Eski `dnaLeagueRaporuGonderGerekirse()` çağrısı ana öğrenme/Telegram zincirinden kaldırıldı.
- Böylece eski Family League Telegram ve real-readiness hazırlık yolu çalışma zamanında tetiklenmez.
- LAB Premier, tek üst katman sanal lig ve rapor otoritesi olarak korunur.
- Gerçek emir kapısı fail-closed kalır.
