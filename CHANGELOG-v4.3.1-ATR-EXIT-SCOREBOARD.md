# AGROS v4.3.1 — ATR Live Exit + Method Scoreboard

- ATR_TRAIL_1_5X / 2_0X / 2_5X modelleri sanal dinamik exit uygulayıcısına eklendi.
- ATR yüzdesi aktif pozisyonun en son fiyat yolu örneğinden okunur; tepe anındaki ATR dondurulur.
- Tepe kâr, ATR x katsayı kadar geri verildiğinde dinamik kapanış uygulanır.
- Her pozisyon açılışta atanmış exit metoduna yazılır.
- Her kapanışta yöntem, TP/SL/BE, net, komisyon, PF ve expectancy kalıcı çeteleye kaydedilir.
- Telegram kapanış mesajında kullanılan exit yöntemi ve o yöntemin güncel çetelesi gösterilir.
- Veri dosyası: data/exit-method-scoreboard.json
