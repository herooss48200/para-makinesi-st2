# AGROS v5.1.0 — Dynamic LAB Premier League

## Amaç
İlk kez artıya geçen v5.0.11 Premier kanonik kasasını ve açık pozisyonları bozmadan, LAB evlatlarının seçimini açıklanabilir dinamik lige dönüştürmek.

## Premier giriş yolları
- Tarihsel Pozitif: N>=5, Net>0, PF>1, Expectancy>0.
- Son-5 Geçici: tarihsel kapıyı geçmeyen fakat son beş kapanışı Net>0, PF>1, Expectancy>0 olan LAB.
- Ters Premier: orijinal yönde N>=10, başarı<=%35, Net<0 ve PF<1 olan LAB sinyali tek sanal pozisyonda ters yöne çevrilir.

## LAB Ligi
- Premier şartlarını kaybeden LAB yeni açılışlarda LAB Ligi'ne düşer.
- Lig değişiminde tarihsel hafıza, ileri sonuçlar ve Exit öğrenmesi sıfırlanmaz.
- N5-9 sistematik kaybedenler Ters Gölge'de kalır.
- Premier ekonomik kapılarından yalnız birine veya tek örneğe uzak LAB'lar Kâra Yakın yarışmacı olarak raporlanır.

## Exit görünürlüğü
- Açık pozisyonun atanmış Exit'i değişmez.
- Yeni pozisyon her açılışta LAB'ın güncel kendi Exit'ini alır.
- Exit değişimi, önceki Exit, değişim sayısı ve yeni işlemde uygulanacak değişim canlı raporda görünür.
- Kendi Exit'i oluşmamış LAB güvenli mevcut kademe fallback kullanırken Exit yarışına devam eder.

## Canlı Portföy
Premier Ligi en üstte gösterilir. Tarihsel, Son-5 ve Ters grupların aday sayıları ve ayrı yeni performansları görünür. LAB satırlarında tarihsel N/başarı/Net, yeni Net, ilerleme oku ve aktif Exit yer alır.

## Koruma
- v5.0.11 Premier kanonik defteri korunur.
- Eski RECENT5 kayıtları Son-5 grubuna, diğer eski Premier kayıtları Tarihsel gruba taşınır.
- Restart-GAP öğrenme ve Premier performansına dahil edilmez.
- Family emir yetkisi ve gerçek emir yetkisi kapalıdır.
