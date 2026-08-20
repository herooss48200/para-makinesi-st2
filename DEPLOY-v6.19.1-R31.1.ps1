$ErrorActionPreference = 'Stop'

$Repo = 'C:\Users\ASUS\OneDrive\Desktop\ArgosPlatform\Repositories\ParaMakinesiBinance\ST2'
$Key  = 'C:\Users\ASUS\OneDrive\Desktop\ArgosPlatform\Repositories\ParaMakinesiBinance\arsiv\SSH\Aktif\para-makinesi-binance.pem'
$HostName = 'ubuntu@3.127.232.147'
$CommitMessage = 'fix(st2): v6.19.1 R31.1 15m stable Onur guard Telegram'

Set-Location $Repo

Write-Host '===== LOCAL TEST ====='
npm test
if ($LASTEXITCODE -ne 0) { throw 'LOCAL npm test failed' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }

$Files = @(
  '2_rapor.js','4_pozisyon.js','72_st2_renko_entry.js','85_st2_real_order_execution.js',
  '98_st2_final_direction_guard.js','ayarlar.js','motor.js','package.json','package-lock.json',
  'test_v6190_r31_mtf_live_struct_stop.js','test_v6191_r311_15m_stable.js','versiyon.js',
  'CHANGELOG-v6.19.1-R31.1.md','AWS-DEPLOY-v6.19.1-R31.1.md','TEST-RESULT-v6.19.1-R31.1.txt',
  'DEPLOY-v6.19.1-R31.1.ps1'
)

git add -- $Files
Write-Host '===== STAGED DIFF ====='
git diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) { throw 'Staged change yok; paket uygulanmamış olabilir.' }

git commit -m $CommitMessage
if ($LASTEXITCODE -ne 0) { throw 'git commit failed' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'git push failed' }

Write-Host '===== AWS DEPLOY ====='
$remote = @'
cd ~/apps/para-makinesi-st2-gercek && \
git pull --ff-only origin main && \
npm test && \
pm2 restart agros-st2-gercek && \
sleep 3 && \
pm2 status agros-st2-gercek && \
pm2 logs agros-st2-gercek --lines 300 --nostream | grep -E "6.19.1-R31.1|MARKET READY|FULL MUTABAKAT|Entry Gate: READY|ONUR SHORT|GERÇEK AÇILIŞ TELEGRAM|GERÇEK KAPANIŞ TELEGRAM|ERROR|HATA" | tail -80
'@
ssh -i $Key $HostName $remote
if ($LASTEXITCODE -ne 0) { throw 'AWS deploy/test failed' }
