# AGROS v4.3.4 — Five-Sample DNA + Exit Assignment

## Amaç
Öğrenilmiş DNA ve Exit sonuçlarının yeniden uzun süre beklemeden karar katmanında görünmesini sağlamak.

## Değişiklikler
- Premier League minimum yaşam boyu DNA örneği: **10 → 5**
- Championship minimum yaşam boyu DNA örneği: **10 → 5**
- Dinamik Exit exact-regime minimum örneği: **12 → 5**
- Dinamik Exit DNA-all-regimes fallback minimum örneği: **20 → 5**
- League Engine'in doğrulanmış Exit kabul eşiği: **20 → 5**

## Korunan kârlılık kuralları
Premier için hâlâ bütün koşullar zorunludur:
- N >= 5
- Expectancy > 0
- Profit Factor > 1
- Net > 0

Dinamik Exit için hâlâ bütün koşullar zorunludur:
- N >= 5
- Net > 0
- Profit Factor > 1
- Beat Rate >= %55
- Güncel pencere ortalaması kabul sınırının altında değildir

Kanıtlı dinamik Exit bulunamazsa pozisyon **Mevcut Kademe Sistemi** ile açılır; DNA bloke edilmez.
