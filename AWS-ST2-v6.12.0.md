# AWS Uygulama ve Doğrulama — AGROS ST2 v6.12.0

## Güvenlik sınırı

Bu ZIP bir **v6.11.2 → v6.12.0 değişiklik paketidir**. Yalnız şu tabana uygulanmalıdır:

```text
6d2e028 fix(st2): v6.11.2 direct profit floor and two real slots
```

Paket `.env`, `data`, state, ledger, log, `.git` ve `node_modules` içermez. Canlı verileri silmez veya değiştirmez.

## Önerilen uygulama yeri

Önce yalnız geliştirme worktree’sinde uygulanmalıdır:

```bash
cd /home/ubuntu/apps/para-makinesi-st2-gelistirme
git branch --show-current
git log -1 --oneline
git status --short
```

Beklenen branch/taban:

```text
fix/v6112-entry-integrity
6d2e028 ... v6.11.2 direct profit floor and two real slots
```

`node_modules` takip edilmeyen bağlantı olarak görünüyorsa kaynak değişikliği değildir.

## Paket uygulama

ZIP’i geçici klasöre açıp yalnız paket içindeki dosyaları geliştirme worktree’sine kopyalayın. `.git`, `data`, `.env`, log veya state dosyaları pakette yoktur.

Örnek:

```bash
PKG=/tmp/AGROS-ST2-v6.12.0-ST1-GATED-RENKO-DIRECTIONAL-UPDATE.zip
TMP=/tmp/agros-v6120-update
DST=/home/ubuntu/apps/para-makinesi-st2-gelistirme

rm -rf "$TMP"
mkdir -p "$TMP"
unzip -q "$PKG" -d "$TMP"
cp -a "$TMP/AGROS-ST2-v6.12.0-ST1-GATED-RENKO-DIRECTIONAL-UPDATE/." "$DST/"
cd "$DST"
```

## Zorunlu doğrulama

```bash
git diff --check
node --check 87_st2_st1_entry_gate.js
node --check 72_st2_renko_entry.js
node --check 73_st2_renko_entry_evolution.js
node --check 69_operation_intelligence_dashboard.js
node --check 2_rapor.js
npm test
```

Beklenen son iki önemli satır:

```text
✅ v6.11.2 direct floor/activation, no 2x rule, frozen brick trail and configurable 2-slot passed
✅ v6.12.0 ST1-gated Renko reference entry + fresh-cross safety + directional live report passed
```

## Değişiklik kontrolü

```bash
git status --short
git diff --stat
git diff -- 74_st2_renko_exit_evolution.js 85_st2_real_order_execution.js 86_st2_close_lifecycle.js
```

Son komut boş çıkmalıdır; kritik exit/gerçek emir dosyaları değiştirilmemiştir.

## Canlıya geçiş sınırı

Bu aşamada PM2 restart yapılmamalıdır. Önce geliştirme worktree’sindeki gerçek AWS `node_modules` ile `npm test` tam geçmeli, diff incelenmeli ve kullanıcı onayı alınmalıdır. Daha sonra Git commit/push ve canlı dağıtım ayrı kontrollü adım olarak yapılmalıdır.
