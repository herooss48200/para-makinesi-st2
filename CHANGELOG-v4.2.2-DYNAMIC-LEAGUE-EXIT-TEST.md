# AGROS v4.2.2 — DYNAMIC LEAGUE EXIT TEST

- Sanal emir havuzu sabit DNA sayısından çıkarıldı.
- Güncel lig modelindeki tüm Premier ve Championship üyeleri sanal işlem açabilir.
- Lig transferleri sonrası havuz kod değişmeden otomatik güncellenir.
- Gerçek emir kapısı değişmedi: yalnızca Premier, kârlılık şartları ve açık yetkilendirme ile fail-closed.
- Yeni deney kimliği ile eski gözlem kasası arşivlenir; AWS öğrenme/DNA/replay verileri korunur.
- Premier ve Championship açılış, kapanış, komisyon, net PNL, PF ve expectancy ayrı izlenir.
- Birleşik test kasası ve aktif lig/exit planları Telegram raporuna eklendi.
- Eski genel portföy sayaçları silinmez; yeni test kasasına karışmaz.
