# AGROS v4.5.4 — Report Consistency Final

## Düzeltilen kök nedenler

- Exit Evolution sıralaması artık kalıcı özette bulunan eski/kaldırılmış varyantları aktif yarışa sokmaz.
- Aktif katalog ve DNA best-exit seçimi yalnız güncel 27 çekirdek exit algoritmasının ayarlı varyantlarını kullanır.
- Telegram Exit Evolution başlığı `33` gibi tarihsel bucket sayıları yerine güncel çekirdek yarışan exit sayısını gösterir.
- Geçmiş varyantlar silinmez; arşiv olarak sayılır fakat sıralamayı ve dinamik best-exit seçimini etkileyemez.
- Premier League 2.0 kabul kapısı yalnız gerçekleşmiş DNA metriklerini kullanır: DNA N, expectancy, PF ve net.
- Elite Exit/çift metrikleri Premier kabul şartı olmaktan çıkarıldı; sadece exit ataması, sıralama ve audit kanıtıdır.
- Premier Telegram satırı DNA örnek sayısını `DNA N...`, exit kanıt örneğini ayrı `ExitN...` olarak gösterir.
- Sınıflandırma politika sürümü 3'e yükseltildi; deploy sonrası eski lig state'i bir defalık yeniden sınıflandırılır.

## Güvenlik

- Trade giriş motoru değiştirilmedi.
- Eski öğrenme, replay ve muhasebe verileri silinmez.
- Dinamik exit executor davranışı değiştirilmedi; yalnız aktif katalog kaynağı ve lig kabul kaynağı tutarlı hale getirildi.
