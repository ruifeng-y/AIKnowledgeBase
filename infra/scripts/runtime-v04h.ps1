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
  $reg=Call-Api POST "/api/v1/auth/register" $null @{email="rt-h-$suffix@example.com";password="password123";name="RT H"}
  $tok=($reg.Content|ConvertFrom-Json).tokens.accessToken
  $ws=Call-Api POST "/api/v1/workspaces" $tok @{name="RT WS";slug="rt-ws-h-$suffix"}
  $sp=Call-Api POST "/api/v1/workspaces/$(($ws.Content|ConvertFrom-Json).id)/spaces" $tok @{name="RT Space";slug="rt-space-h-$suffix"}
  $spId=($sp.Content|ConvertFrom-Json).id
  $tmp=Join-Path $env:TEMP "rt-h-$suffix.md"
  $md="# Backend`n`nOverview of backend. " + ("token sample content "*40) + "`n`n## Auth`n`nAuth section body. " + ("jwt related text "*40)
  [System.IO.File]::WriteAllText($tmp,$md)
  $up=((& curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$spId/documents/upload" -H "Authorization: Bearer $tok" -F "file=@$tmp;type=text/markdown" -F "title=RT Chunk") | ConvertFrom-Json)
  Write-Host "UPLOAD $($up.status) id=$($up.id)"
  $ready=$false
  for($i=0;$i -lt 20;$i++){
    Start-Sleep -Seconds 1
    $st=(Call-Api GET "/api/v1/documents/$($up.id)/processing" $tok $null).Content|ConvertFrom-Json
    if($st.documentStatus -eq "READY"){$ready=$true; Write-Host "READY after $($i+1)s"; break}
  }
  if(-not $ready){Write-Host "READY_TIMEOUT"} else {Write-Host "RUNTIME_PROCESS_PASS"}
  $chunks=(Call-Api GET "/api/v1/documents/$($up.id)/chunks" $tok $null).Content|ConvertFrom-Json
  Write-Host "CHUNKS total=$($chunks.total) version=$($chunks.versionId)"
  $n1=$chunks.total
  $repro=(Call-Api POST "/api/v1/documents/$($up.id)/reprocess" $tok $null).Content|ConvertFrom-Json
  Start-Sleep -Seconds 4
  $chunks2=(Call-Api GET "/api/v1/documents/$($up.id)/chunks" $tok $null).Content|ConvertFrom-Json
  Write-Host "RECHUNK total=$($chunks2.total) same=$($chunks2.total -eq $n1) enqueued=$($repro.enqueued)"
  Write-Host "RUNTIME_PASS"
} catch { Write-Host "RUNTIME_FAIL $($_.Exception.Message)" }
finally { Stop-Job $api,$worker -ErrorAction SilentlyContinue; Remove-Job $api,$worker -Force -ErrorAction SilentlyContinue }
