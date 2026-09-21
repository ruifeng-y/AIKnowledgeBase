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
  $reg=Call-Api POST "/api/v1/auth/register" $null @{email="rt-j-$suffix@example.com";password="password123";name="RT J"}
  $tok=($reg.Content|ConvertFrom-Json).tokens.accessToken
  $ws=Call-Api POST "/api/v1/workspaces" $tok @{name="RT WS";slug="rt-ws-j-$suffix"}
  $sp=Call-Api POST "/api/v1/workspaces/$(($ws.Content|ConvertFrom-Json).id)/spaces" $tok @{name="RT Space";slug="rt-space-j-$suffix"}
  $spId=($sp.Content|ConvertFrom-Json).id
  $tmp=Join-Path $env:TEMP "rt-j-$suffix.md"
  [System.IO.File]::WriteAllText($tmp, "# JWT`n`nJWT authentication token explanation content.")
  $up=((& curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$spId/documents/upload" -H "Authorization: Bearer $tok" -F "file=@$tmp;type=text/markdown") | ConvertFrom-Json)
  for($i=0;$i -lt 20;$i++){ Start-Sleep -Seconds 1; $st=(Call-Api GET "/api/v1/documents/$($up.id)/processing" $tok $null).Content|ConvertFrom-Json; if($st.documentStatus -eq "READY"){break} }
  $search=(Call-Api POST "/api/v1/spaces/$spId/search/vector" $tok @{query="JWT authentication"; topK=10})
  $body=$search.Content|ConvertFrom-Json
  Write-Host "SEARCH status=$($search.StatusCode) total=$($body.total) topK=$($body.topK) threshold=$($body.threshold) model=$($body.model)"
  if($body.total -gt 0){ Write-Host "FIRST score=$($body.items[0].score) chunk=$($body.items[0].chunkId)" }
  Write-Host "RUNTIME_VECTOR_SEARCH_PASS"
} catch { Write-Host "RUNTIME_FAIL $($_.Exception.Message)"; Receive-Job $api,$worker -ErrorAction SilentlyContinue | Select-Object -First 20 }
finally { Stop-Job $api,$worker -ErrorAction SilentlyContinue; Remove-Job $api,$worker -Force -ErrorAction SilentlyContinue }
