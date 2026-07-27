# AGROS ST2 v6.1.2 — Global Runtime Consistency & DNA Context Recovery

- Trade Engine, emir, stop, BE ve exit davranışı değiştirilmedi.
- GAP/forward muhasebe raporu ham eski sayaç yerine kanonik Premier/Shadow/Real partition ile mutabakat üretir; ham fark audit olarak korunur.
- ST1 başlıklı eski final denetim ST2 olarak düzeltildi.
- Eski schema-1 historical kayıtlar DNA bağlamı varmış gibi UNKNOWN kart üretmez; dürüst PATTERN_AGGREGATE/NOT_RECORDED fallback kullanır.
- Global Historical Runtime varsayılan olarak eksik 30 coin eğitimini planlar; env ile kapatılabilir.
- Telegram timeout sırasında aynı uzun mesaj düz metin olarak ikinci kez gönderilmez.
