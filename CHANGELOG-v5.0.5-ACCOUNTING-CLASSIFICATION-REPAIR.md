# AGROS v5.0.5 — Accounting Classification Repair

## Düzeltildi

- Eski `restartGapOzet.closedQuarantined` değeri artık v5 migration kapanışı gibi kullanılmıyor.
- Kümülatif Restart Gap sayacı yalnız bilgi amaçlı telemetri olarak gösteriliyor.
- Tarihsel fark, bilimsel kapanışlar ve migration anındaki aktif pozisyonlar üzerinden sınıflandırılıyor.
- Mevcut v5.0.4 kalıcı state açılışta otomatik ve tek seferlik onarılıyor.
- İleri dönem `Açılan / Kapanan / Aktif` kesin defter sayaçları korunuyor; sıfırlanmıyor.
- Migration pozisyonları için `Yüklenen / Kapanan / Aktif / Mutabakat` ayrı gösteriliyor.
- Canlı portföy artık `Premier aktif / Gölge aktif / Restart Gap aktif / Toplam izlenen` ayrımını açıkça gösteriyor.

## Değişmeyenler

- Trade Engine, giriş ve çıkış kuralları değiştirilmedi.
- DNA, LAB, League ve Exit öğrenme verileri silinmedi.
- Gerçek emir yetkisi ve fail-closed koruması değiştirilmedi.
