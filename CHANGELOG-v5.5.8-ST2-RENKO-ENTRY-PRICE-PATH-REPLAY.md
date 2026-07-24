# AGROS ST2 v5.5.8 — Renko Entry Price-Path Replay

## Düzeltme

Önceki v5.5.7 aday karşılaştırması yalnız aday giriş ile gerçek kapanış fiyatı arasındaki farkı hesaplıyordu. Bu, 0.25 giriş stop olduktan sonra fiyatın dönüp 0.50 girişini tetiklemesi durumunu bilimsel olarak ayıramıyordu.

## Yeni davranış

Her aday giriş seviyesi için aynı kaydedilmiş fiyat yolu bağımsız oynatılır:

- Aday tetik fiyatına ilk ulaşma anı bulunur.
- Aday tetiklenmediyse `TETIKLENMEDI` yazılır ve başarı/zarar örneğine eklenmez.
- Tetiklendikten sonra açılışta dondurulmuş stop yüzdesi uygulanır.
- Aynı BE tetik ve BE tampon seviyesi uygulanır.
- Pozisyona atanmış frozen Exit modeli yeniden oynatılır (TIME, FIXED TP, MFE, ATR, Trend, Ladder, Dynamic Path, Hybrid).
- Exit modeli ACTUAL ise gerçek kapanış anı/fiyatı korunur.
- Her adayın giriş, çıkış, neden, net, stop, BE ve Exit modeli `lastReplay` altında kanıt olarak saklanır.

## Bilimsel örnek

Aynı fiyat yolunda:

- 0.25 tuğla erken tetiklenir ve STOP olur.
- Fiyat daha sonra toparlanarak 0.50 tuğlayı tetikler.
- 0.50 girişinden itibaren aynı stop/BE/Exit kurallarıyla pozitif kapanır.
- N3 sonunda 0.50 en iyi pozitif aday ise yeni işlemlere atanır.

## Güvenlik

- Gerçekte yalnız tek pozisyon açılır.
- Replay, gerçek emir üretmez.
- Açık pozisyonun giriş seviyesi değiştirilmez.
- Restart-GAP işlemleri öğrenmeye alınmaz.
