# AGROS v3.12.0 — DNA League Engine

## Eklenenler
- Premier League (ilk kapasite: 25 DNA)
- Championship League
- Development / Gelişim League
- Historical League; hiçbir DNA silinmez
- Her 25 kapanışta otomatik transfer dönemi
- Premier terfi ve düşme geçmişi (`data/dna-league-transfers.jsonl`)
- Son LONG/SHORT performansına göre dinamik yön rejimi
- Rolling form, expectancy, PF, confidence, momentum, stability ve exit kanıtını birleştiren lig skoru
- Gelecekte Argos Dev Console tarafından okunacak `data/dna-league-console.json`
- Yeni açılan pozisyona lig profilinin metadata olarak eklenmesi
- Telegram Learning Validation içinde kısa lig özeti

## Güvenlik
- Trade Engine filtrelenmez.
- Lig henüz gerçek emir açma izni vermez.
- Mevcut giriş, hard stop, TP ve kademe sistemi değişmez.
- Tek işlemle transfer yapılmaz; transferler kapanış periyoduna bağlıdır.
