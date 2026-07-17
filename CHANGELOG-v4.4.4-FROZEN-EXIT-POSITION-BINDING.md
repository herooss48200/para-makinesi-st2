# AGROS v4.4.4 — Frozen Exit Position Binding

## Düzeltilen kritik hata

`realOrderBridge.evaluate()` tarafından seçilen `executionExitAssignment`, geçici emir kimliğine yazılıyor fakat kalıcı sanal/gerçek pozisyon nesnesine taşınmıyordu.

## Yeni davranış

- DNA lig profili, gölge exit planı, emir kararı ve donmuş exit ataması tek yardımcı fonksiyonla pozisyona bağlanır.
- Sanal ve gerçek pozisyon açılış yolları aynı bağlantıyı kullanır.
- Açılış Telegram mesajı gerçek atanmış exit modelini gösterir.
- Pozisyonun exit kimliği kaynak nesneden bağımsız kopyalanır; sonradan değişmez.
- Restart hafızasına pozisyonla birlikte yazılabilir.

## Regresyon testi

`test_exit_position_binding.js`, 15 Dakika Exit atamasının pozisyona kopyalandığını ve executor tarafından gerçekten kapanış kararına dönüştürüldüğünü doğrular.
