# AGROS ST2 v6.6.0 — Learned Takeover & Explainable Protection

- Pattern bazında terfi etmiş takeover yüzdesi `activeTakeoverPct` olarak kalıcı profile alınır.
- Yeni pozisyon açılışında takeover ve trail birlikte atanır ve pozisyon boyunca sabit kalır.
- Açık pozisyonların assignment profili sonradan değiştirilmez.
- Takeover aktivasyonu: güvenli ilk koruma + atanmış takeover yüzdesine ulaşılması.
- K0/K1/K2/K3 koruma aşamaları ve açık durum etiketleri eklendi.
- Takeover, yeni peak, stop hareketi ve çıkış olayları için 40 kayıtla sınırlı timeline eklendi.
- Canlı portföy satırına takeover, trail, peak, stop kaynağı ve son olay bilgisi eklendi.
- Trade giriş şartları, Premier/Shadow seçimi ve kapanış motorunun diğer yolları değiştirilmedi.
