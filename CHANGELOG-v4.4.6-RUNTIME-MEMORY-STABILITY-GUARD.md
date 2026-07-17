# AGROS v4.4.6 — Runtime Memory & Intelligence Stability Guard

- DNA Evolution artık büyüyen `data/blackbox-snapshots.jsonl` dosyasını tek seferde RAM'e almaz; satır satır akış halinde okur.
- Bellekte yalnız normalize edilmiş küçük kapanış özetleri tutulur; ayrıntılı snapshot/piyasa yolu alanları anında bırakılır.
- Tek bir bozuk veya aşırı büyük JSONL satırının sınırsız `carry` büyütmesi engellendi.
- 64 MB Node heap altında 70+ MB BlackBox dosyasıyla streaming regresyon testi eklendi.
- Intelligence/League çalışma zinciri doğrudan çağrılarak eski `tradeGroups is not defined` kapsam hatasının geri dönmesini engelleyen test eklendi.
- Emir, pusu, sniper, lig sınıflandırması, sanal muhasebe ve exit karar mantığı değiştirilmedi.
