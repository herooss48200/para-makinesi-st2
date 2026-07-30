# AGROS ST2 v6.8.2 — Operation Lifecycle & Report Truth

## Amaç

ST2'nin Trade Engine matematiğine dokunmadan açılış/kapanış mesajlarını işlem yaşam döngüsüne odaklamak; farklı veri havuzlarını ayırmak; LAB canlı lig hareketlerini kalıcı ve denetlenebilir hale getirmek; rapor mutabakat hatalarını gidermek.

## Değişiklikler

- Açılış mesajı artık giriş kararını, Premier/Shadow kanıtını, Entry Evolution seviyesini, başlangıç riskini ve sabitlenen ATR/MFE planını açıklar.
- Kapanış mesajı K0/K1/K2/K3 yönetim zaman çizelgesini, takeover/BE/stop hareketlerini, MFE/MAE/capture oranını ve kesin kapanış nedenini gösterir.
- 256 imza, exact imza + BB, Exit Replay, DNA Exit Profili ve metot performansı ayrı bilimsel Telegram mesajına taşındı.
- ATR+MFE metot çetelesi bütün açılış atamalarını kapsar; takeover öncesi SL artık görünmez değildir.
- Exit Replay tek işlem sonucu ile aynı DNA'nın birikimli profilini ayrı veri evrenleri olarak gösterir.
- Geniş imza ve exact+BB performanslarında veri kaynağı, kapsam, N=TP+SL+BE, tek paydalı oranlar, BE-hariç kararlı WR, Net/PF/Expectancy açıklandı.
- Shadow muhasebesi bilimsel ledger'dan açık sonuç sınıfıyla hesaplanır; pozitif netli BE, TP sayılmaz.
- LAB canlı lig hafızası LAB bazında kalıcı son-5 pencereye geçirildi.
- Gerçek SHADOW→PREMIER ve PREMIER→SHADOW hareketleri kalıcı transition defterine yazılır.
- "Bu oturum terfi/düşüş" gerçek geçiş sayısı; "canlı koşul Premier/Shadow" mevcut sınıflandırma sayısı olarak ayrıldı.
- Global optimize replay, yalnız aynı tetiklenen işlem evreninin gerçek sonucu ile karşılaştırılır. Teorik toplam, tetiklenmeyen gerçek + tetiklenen replay olarak kurulur.
- Telegram canlı raporu karakter sınırında budanmaz; güvenli satır/parça mekanizmasına bırakılır.
- "En Karlı Aktif Premier" yanıltıcı başlığı, anlık performans sıralaması olarak değiştirildi.
- Süre etiketi `4s` yerine `4sa` biçiminde gösterilir.
- Olgunlaşmamış behavior/consensus motorlarında `%0` yerine `HESAPLANAMADI` gösterilir.
- Manuel/dış kapanışlar operasyon mesajında işaretlenir ve bilimsel öğrenme/çetele dışında tutulur.

## Değişmeyenler

- Trade Engine giriş/çıkış matematiği
- Renko pusu şartları
- Başlangıç stopu, BE, ATR Takeover ve MFE Capture hesapları
- Entry Evolution ve Exit Evolution geçmişi
- Sanal mod, 20x sanal kaldıraç ve maksimum 100 sanal pozisyon ayarı
- State/ledger dosyaları ve mevcut bilimsel kayıtlar
