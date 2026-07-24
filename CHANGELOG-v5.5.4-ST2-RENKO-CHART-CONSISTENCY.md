# v5.5.4 — ST2 Renko Chart Consistency Guard

- ST1 ve Trade Engine değiştirilmedi.
- ST2 Renko üretiminde standart iki-kutu ters dönüş şartı eklendi; tek kutuluk salınımın sahte ters tuğla üretmesi engellendi.
- ST2 Bollinger pusu kararı genel ST1 yüzde yakınlık ayarından ayrıldı.
- LONG yalnız son kapanmış kırmızı Renko tuğlası alt banda en fazla `0.25` tuğla yaklaşmış/değmiş/geçmiş ve tamamen orta bandın altında ise kurulur.
- SHORT aynalı biçimde yalnız son kapanmış yeşil tuğla üst banda temas edip tamamen orta bandın üstündeyse kurulur.
- Pusuya Renko BB seviyeleri, son tuğla OHLC, band farkı (fiyat/tuğla), tolerans ve pattern dizisi eklenir.
- Audit'e pattern dağılımı ve band/orta bölge red nedenleri eklendi.
- Sürüm: `5.5.4-ST2-RENKO-CHART-CONSISTENCY`, strateji `1.0.16`.
