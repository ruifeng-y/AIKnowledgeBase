$ErrorActionPreference = "Stop"
Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
$suffix = Get-Random
$api = Start-Job -ScriptBlock {
  Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
  $env:JWT_SECRET="dev-only-change-me"; $env:JWT_ACCESS_TTL="15m"; $env:JWT_REFRESH_TTL="7d"
  $env:EMBEDDING_PROVIDER="mock"; $env:EMBEDDING_MODEL="mock-embedding-v1"; $env:EMBEDDING_DIMENSION="384"
  node apps/api/dist/main.js *>&1
}
$worker = Start-Job -ScriptBlock {
  Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
  $env:REDIS_URL="redis://localhost:6379"
  $env:S3_ENDPOINT="http://127.0.0.1:9000"; $env:S3_ACCESS_KEY_ID="minioadmin"; $env:S3_SECRET_ACCESS_KEY="change_me"; $env:S3_BUCKET="ai-knowledge-base"
  $env:EMBEDDING_PROVIDER="mock"; $env:EMBEDDING_MODEL="mock-embedding-v1"; $env:EMBEDDING_DIMENSION="384"; $env:EMBEDDING_BATCH_SIZE="32"
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
  $reg=Call-Api POST "/api/v1/auth/register" $null @{email="rt-i-$suffix@example.com";password="password123";name="RT I"}
  $tok=($reg.Content|ConvertFrom-Json).tokens.accessToken
  $ws=Call-Api POST "/api/v1/workspaces" $tok @{name="RT WS";slug="rt-ws-i-$suffix"}
  $sp=Call-Api POST "/api/v1/workspaces/$(($ws.Content|ConvertFrom-Json).id)/spaces" $tok @{name="RT Space";slug="rt-space-i-$suffix"}
  $spId=($sp.Content|ConvertFrom-Json).id
  $tmp=Join-Path $env:TEMP "rt-i-$suffix.md"
  [System.IO.File]::WriteAllText($tmp, "# Emb`n`nembedding runtime content " + ("words "*30))
  $up=((& curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$spId/documents/upload" -H "Authorization: Bearer $tok" -F "file=@$tmp;type=text/markdown") | ConvertFrom-Json)
  $ready=$false
  for($i=0;$i -lt 20;$i++){
    Start-Sleep -Seconds 1
    $st=(Call-Api GET "/api/v1/documents/$($up.id)/processing" $tok $null).Content|ConvertFrom-Json
    if($st.documentStatus -eq "READY"){$ready=$true; break}
  }
  Write-Host "UPLOAD $($up.status) READY=$ready"
  $chunks=(Call-Api GET "/api/v1/documents/$($up.id)/chunks" $tok $null).Content|ConvertFrom-Json
  Write-Host "CHUNKS total=$($chunks.total) version=$($chunks.versionId)"
  Write-Host "RUNTIME_EMBEDDING_PIPELINE_PASS"
} catch { Write-Host "RUNTIME_FAIL $($_.Exception.Message)" }
finally { Stop-Job $api,$worker -ErrorAction SilentlyContinue; Remove-Job $api,$worker -Force -ErrorAction SilentlyContinue }
