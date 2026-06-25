// ============================================================
// PARA MAKNES BINANCE - SÜRÜM KMLK DOSYASI
// ============================================================

module.exports = {
    isim: "Para Makinesi Binance",
    kodAdi: "SNIPER",
    botSurumu: "2.1.0",
    stratejiSurumu: "1.0.0",
    yayinTarihi: "25.06.2026",

    ortam: {
        aws: true,
        github: true,
        emirModu: "SANAL"
    },

    strateji: {
        pusuPeriyodu: "4h",
        sniperPeriyodu: "5m",
        bollingerPusu: true,
        superTrendOnayi: true,
        pusuOrtaBandFiltresi: true,
        pusuKaliteFiltresi: true,
        dinamikStop: true,
        sanalIslem: true
    },

    degisiklikler: [
        "Pusu ve Sniper farklı zaman dilimi desteği aktif edildi.",
        "Pusu Kalite Filtresi eklendi.",
        "Bollinger Orta Band filtresi pusu tarafına taşındı.",
        "Sniper tarafındaki orta band filtresi kaldırıldı.",
        "Dinamik kademeli stop sistemi geliştirildi.",
        "Telegram canlı raporlarına versiyon bilgisi eklendi.",
        "AWS sunucu altyapısı kuruldu.",
        "GitHub Private Repository sürüm yönetimine geçildi."
    ],

    notlar: [
        "Pusu Motoru ilk grafik kontrollerinde doğrulandı.",
        "Sniper Motoru ve dönüş trendi tespiti test aşamasındadır.",
        "Risk Motoru sanal işlemlerde gözlemlenmeye devam edecektir."
    ]
};
