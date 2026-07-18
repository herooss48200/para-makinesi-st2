# AGROS v4.5.3 — Exit Finalization

- DNA Kimlik Kartı WR alanı gerçek TP/SL/ranking verisine bağlandı.
- League oyuncu modeline TP, SL, BE, decided ve winRate alanları taşındı.
- Trend Exit (ST Bozulması) canlı sanal executor desteği eklendi.
- 27 çekirdek exit modelinin 27/27 canlı executor kapsam kontrolü eklendi.
- Yeni emir yolunu beklemeden doğrulayan, kalıcı karar geçmişini kirletmeyen runtime self-test eklendi.
- Restart-gap ile geri yüklenen eski pozisyonlar yeni pozisyon fallback istatistiğinden ayrıldı.
- Bilinmeyen fiyat yolu bulunan eski pozisyonlara dinamik exit sonradan uygulanmaz; güvenli karantina korunur.
