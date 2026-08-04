# AGROS ST2 v6.12.0 — ST1 Gated Renko Entry & Directional Report

## Taban

- Çalışan kaynak tabanı: `AGROS ST2 v6.11.2`
- Git tabanı: `6d2e028 fix(st2): v6.11.2 direct profit floor and two real slots`
- Bu paket yalnız v6.11.2 üzerine uygulanacak değişen/gerekli dosyaları içerir.

## Yeni giriş sözleşmesi

- ST2 Renko; patterni, yönü, Bollinger temasını ve referans tuğlayı belirler.
- ST1, yan etkisiz giriş kapısı olarak aynı yönlü normal 15m pusu ve güncel 3m SuperTrend koşullarını doğrular.
- ST1’in kendi normal mum tetik seviyesi de kırılmış olmalıdır.
- SHORT giriş tetik seviyesi: son tamamlanmış yeşil referans Renko tuğlasının `low` değeri.
- LONG giriş tetik seviyesi: son tamamlanmış kırmızı referans Renko tuğlasının `high` değeri.
- Canlı fiyat referansı kırarken ST1 koşulları aynı anda uygun değilse kırılım tüketilir; ST1 sonradan uygun olduğunda eski kırılım kullanılamaz. Fiyat referansın öbür tarafına dönüp yeni kırılım üretmelidir.
- ST1 pusu geçerliliği kendi özgün sınırı içinde, son en fazla 3 kapanmış 15m mumdan yan etkisiz ve ileri veri sızıntısı olmadan yeniden hesaplanır.
- ST2 pususu en fazla 3 kapanmış 15m kaynak mum yaşar; saatlerce Renko tuğlası bekleyerek taşınmaz.
- Güncel ST2 Renko patterni/Bollinger bağlamı bozulursa pusu silinir.
- Karşıt ST1 pusu, karşıt ST1 SuperTrend ve geç giriş sınırı güvenli biçimde pusuyu iptal edebilir.

## Entry Evolution

- Öğrenilmiş `0.25T–1.50T` değerleri ve geçmiş state/ledger korunur.
- Entry Evolution artık canlı giriş zamanlama yetkisi değildir.
- Seçilen tuğla mesafesi bilimsel Shadow/replay ve Premier kanıt zincirinde yaşamaya devam eder.
- Gerçek giriş fiyatı Renko referans kırılımı + ST1 kapısı tarafından belirlenir.

## Canlı rapor

Bilimsel ledger’ın kanonik bölümleri yön bazında ayrıldı:

- Bilimsel Premier: LONG / SHORT
- Gerçek Premier: LONG / SHORT
- Shadow: LONG / SHORT

Her satırda `N`, başarılı, başarısız, BE, WR, net ve PF gösterilir. LONG + SHORT + UNKNOWN sayıları genel toplamla mutabakat kontrolünden geçer.

## Değiştirilmeyen kritik sistemler

Aşağıdaki çalışma zincirleri değiştirilmedi:

- Gerçek emir gönderim ve fail-closed güvenliği
- İki gerçek pozisyon slotu
- Başlangıç stopu
- Doğrudan kâr tabanı ve aktivasyon kuralları
- Pozisyona dondurulmuş Renko brick trail
- Renko Takeover
- Exit Evolution
- MFE/ATR Shadow replay
- Kapanış commit bariyeri ve gerçek komisyon muhasebesi

## Yeni test

`test_v6120_st1_gated_renko_directional_report.js` şu sözleşmeleri doğrular:

- ST1 aynı yönlü 15m pusu + kendi tetik + 3m ST kapısı
- ST1 pususunun 3 kapanmış 15m mumluk geçerlilik penceresi
- ST1 uygun değilken oluşan kırılımın sonradan kullanılamaması
- Reset sonrası taze kırılımda tek emir
- Entry Evolution’ın Shadow-only zamanlama rolü
- 3 kapanmış 15m mumda ST2 pusu iptali
- Bilimsel/Gerçek/Shadow LONG-SHORT mutabakatı
