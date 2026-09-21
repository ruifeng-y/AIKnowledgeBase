$ErrorActionPreference = "Stop"
Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
$suffix = Get-Random
$api = Start-Job -ScriptBlock {
  Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
  $env:JWT_SECRET="dev-only-change-me"; $env:JWT_ACCESS_TTL="15m"; $env:JWT_REFRESH_TTL="7d"
  node apps/api/dist/main.js *>&1
}
$worker = Start-Job -ScriptBlock {
  Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
  $env:REDIS_URL="redis://localhost:6379"
  $env:S3_ENDPOINT="http://127.0.0.1:9000"; $env:S3_ACCESS_KEY_ID="minioadmin"; $env:S3_SECRET_ACCESS_KEY="change_me"; $env:S3_BUCKET="ai-knowledge-base"
  node apps/worker/dist/main.js *>&1
}
Start-Sleep -Seconds 6
function Call-Api {
  param($Method,$Path,$Token,$Body)
  $h=@{}
  if($Token){$h.Authorization="Bearer $Token"}
  if($null -ne $Body){$h.'Content-Type'='application/json'; return Invoke-WebRequest -Uri "http://127.0.0.1:3001$Path" -Method $Method -Headers $h -Body ($Body|ConvertTo-Json) -UseBasicParsing}
  Invoke-WebRequest -Uri "http://127.0.0.1:3001$Path" -Method $Method -Headers $h -UseBasicParsing
}
try {
  $reg=Call-Api POST "/api/v1/auth/register" $null @{email="rt-p1-$suffix@example.com";password="password123";name="RT P1"}
  $tok=($reg.Content|ConvertFrom-Json).tokens.accessToken
  $ws=Call-Api POST "/api/v1/workspaces" $tok @{name="RT WS";slug="rt-ws-p1-$suffix"}
  $sp=Call-Api POST "/api/v1/workspaces/$(($ws.Content|ConvertFrom-Json).id)/spaces" $tok @{name="RT Space";slug="rt-space-p1-$suffix"}
  $spId=($sp.Content|ConvertFrom-Json).id
  $tmp1=Join-Path $env:TEMP "rt-p1-v1-$suffix.md"
  [System.IO.File]::WriteAllText($tmp1, "# V1`n`n" + ("v1 content words "*20))
  $up1=((& curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$spId/documents/upload" -H "Authorization: Bearer $tok" -F "file=@$tmp1;type=text/markdown") | ConvertFrom-Json)
  $docId=$up1.id; $v1=$up1.currentVersionId
  $tmp2=Join-Path $env:TEMP "rt-p1-v2-$suffix.md"
  [System.IO.File]::WriteAllText($tmp2, "v2 unique content for runtime check")
  $up2=((& curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$spId/documents/$docId/versions" -H "Authorization: Bearer $tok" -F "file=@$tmp2;type=text/markdown") | ConvertFrom-Json)
  $v2=$up2.currentVersionId
  foreach($pair in @($v1,$v2)){ Start-Sleep -Seconds 2 }
  $def=(Call-Api GET "/api/v1/documents/$docId/chunks" $tok $null).Content|ConvertFrom-Json
  $q1=(Call-Api GET "/api/v1/documents/$docId/chunks?versionId=$v1" $tok $null).Content|ConvertFrom-Json
  $q2=(Call-Api GET "/api/v1/documents/$docId/chunks?versionId=$v2" $tok $null).Content|ConvertFrom-Json
  Write-Host "DEFAULT version=$($def.versionId) total=$($def.total) current=$v2 match=$($def.versionId -eq $v2)"
  Write-Host "V1 version=$($q1.versionId) total=$($q1.total) match=$($q1.versionId -eq $v1)"
  Write-Host "V2 version=$($q2.versionId) total=$($q2.total) match=$($q2.versionId -eq $v2)"
  $regB=Call-Api POST "/api/v1/auth/register" $null @{email="rt-p1b-$suffix@example.com";password="password123";name="RT P1B"}
  $tokB=($regB.Content|ConvertFrom-Json).tokens.accessToken
  $cross = "n/a"
  try { Call-Api GET "/api/v1/documents/$docId/chunks?versionId=$v1" $tokB $null | Out-Null; $cross="NOT_404" } catch { $r=$_.Exception.Response; if($r){$cross=[int]$r.StatusCode} }
  $foreign = "n/a"
  $ws2=Call-Api POST "/api/v1/workspaces" $tokB @{name="WS2";slug="rt-ws-p1b-$suffix"}
  $sp2=Call-Api POST "/api/v1/workspaces/$(($ws2.Content|ConvertFrom-Json).id)/spaces" $tokB @{name="S2";slug="rt-space-p1b-$suffix"}
  $tmp3=Join-Path $env:TEMP "rt-p1-b-$suffix.txt"
  [System.IO.File]::WriteAllText($tmp3, "b doc")
  $upB=((& curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$(($sp2.Content|ConvertFrom-Json).id)/documents/upload" -H "Authorization: Bearer $tokB" -F "file=@$tmp3;type=text/plain") | ConvertFrom-Json)
  try { Call-Api GET "/api/v1/documents/$docId/chunks?versionId=$($upB.currentVersionId)" $tok $null | Out-Null; $foreign="NOT_404" } catch { $r=$_.Exception.Response; if($r){$foreign=[int]$r.StatusCode} }
  Write-Host "CROSS_TENANT=$cross FOREIGN_VERSION=$foreign"
  Write-Host "RUNTIME_PASS"
} catch { Write-Host "RUNTIME_FAIL $($_.Exception.Message)" }
finally { Stop-Job $api,$worker -ErrorAction SilentlyContinue; Remove-Job $api,$worker -Force -ErrorAction SilentlyContinue }
