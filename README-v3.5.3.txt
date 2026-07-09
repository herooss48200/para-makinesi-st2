AGROS v3.5.3 - LEARNING VALIDATION TELEGRAM

Bu sürümde Learning Validation katmanı Telegram canlı portföy raporuna bağlandı.

Eklenenler:
- 20_learning_validation.js
- Canlı portföy raporu içinde 🧠 LEARNING VALIDATION v3.5.3 bloğu
- Floating PNL: toplam, long, short
- Gerçek Net: Net Kasa + Floating
- Overall Win Rate, Expectancy, son işlemlere göre Profit Factor
- Long/Short ayrı Win Rate, Expectancy ve Net
- BlackBox signatureMatrixStats üzerinden güçlü/riskli DNA özeti
- Öğrenme kapsamı ve ilerleme yüzdesi

Korunan prensipler:
- Trade Engine değiştirilmedi.
- İşlem açma/kapatma kurallarına dokunulmadı.
- Telegram kullanıcı arayüzü güçlendirildi.

Kurulum:
1) ZIP içeriğini repo üzerine kopyala.
2) npm run check
3) git add .
4) git commit -m "v3.5.3 Learning Validation Telegram"
5) git push
6) AWS güvenli deploy bloğunu çalıştır.
