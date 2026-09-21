$ErrorActionPreference = "Stop"
Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
$suffix = Get-Random
$api = Start-Job -ScriptBlock {
  Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
  $env:JWT_SECRET="dev-only-change-me"; $env:JWT_ACCESS_TTL="15m"; $env:JWT_REFRESH_TTL="7d"
  $env:DATABASE_URL="postgresql://akb:change_me@localhost:5432/ai_knowledge_base"
  $env:EMBEDDING_PROVIDER="mock"; $env:EMBEDDING_MODEL="mock-embedding-v1"; $env:EMBEDDING_DIMENSION="384"
  $env:RERANKER_PROVIDER="mock"; $env:RERANKER_MODEL="mock-reranker-v1"
  $env:S3_ENDPOINT="http://127.0.0.1:9000"; $env:S3_ACCESS_KEY_ID="minioadmin"; $env:S3_SECRET_ACCESS_KEY="change_me"; $env:S3_BUCKET="ai-knowledge-base"
  node apps/api/dist/main.js *>&1
}
$worker = Start-Job -ScriptBlock {
  Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
  $env:REDIS_URL="redis://localhost:6379"
  $env:DATABASE_URL="postgresql://akb:change_me@localhost:5432/ai_knowledge_base"
  $env:S3_ENDPOINT="http://127.0.0.1:9000"; $env:S3_ACCESS_KEY_ID="minioadmin"; $env:S3_SECRET_ACCESS_KEY="change_me"; $env:S3_BUCKET="ai-knowledge-base"
  $env:EMBEDDING_PROVIDER="mock"; $env:EMBEDDING_MODEL="mock-embedding-v1"; $env:EMBEDDING_DIMENSION="384"; $env:EMBEDDING_BATCH_SIZE="32"
  node apps/worker/dist/main.js *>&1
}
Start-Sleep -Seconds 7
function Call-Api {
  param($Method,$Path,$Token,$Body)
  $h=@{}
  if($Token){$h.Authorization="Bearer $Token"}
  if($null -ne $Body){$h.'Content-Type'='application/json'; return Invoke-WebRequest -Uri "http://127.0.0.1:3001$Path" -Method $Method -Headers $h -Body ($Body|ConvertTo-Json) -UseBasicParsing}
  Invoke-WebRequest -Uri "http://127.0.0.1:3001$Path" -Method $Method -Headers $h -UseBasicParsing
}
try {
  $health=(Call-Api GET "/health" $null $null)
  Write-Host "HEALTH status=$($health.StatusCode)"
  $reg=Call-Api POST "/api/v1/auth/register" $null @{email="rt-l-$suffix@example.com";password="password123";name="RT L"}
  $tok=($reg.Content|ConvertFrom-Json).tokens.accessToken
  $ws=Call-Api POST "/api/v1/workspaces" $tok @{name="RT WS L";slug="rt-ws-l-$suffix"}
  $sp=Call-Api POST "/api/v1/workspaces/$(($ws.Content|ConvertFrom-Json).id)/spaces" $tok @{name="RT Space L";slug="rt-space-l-$suffix"}
  $spId=($sp.Content|ConvertFrom-Json).id
  $tmp=Join-Path $env:TEMP "rt-l-$suffix.md"
  [System.IO.File]::WriteAllText($tmp, "# JWT`n`nJWT authentication token explanation content. zqxkeyword unique.")
  $up=((& curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$spId/documents/upload" -H "Authorization: Bearer $tok" -F "file=@$tmp;type=text/markdown") | ConvertFrom-Json)
  $docId=$up.id
  for($i=0;$i -lt 25;$i++){
    Start-Sleep -Seconds 1
    $st=(Call-Api GET "/api/v1/documents/$docId/processing" $tok $null).Content|ConvertFrom-Json
    if($st.documentStatus -eq "READY"){break}
  }
  Write-Host "DOC status=$($st.documentStatus)"

  $vec=(Call-Api POST "/api/v1/spaces/$spId/search/vector" $tok @{query="JWT authentication"; threshold=-1.0})
  Write-Host "VECTOR status=$($vec.StatusCode)"

  $hy=(Call-Api POST "/api/v1/spaces/$spId/search/hybrid" $tok @{query="zqxkeyword"; candidateK=20})
  Write-Host "HYBRID status=$($hy.StatusCode) total=$(($hy.Content|ConvertFrom-Json).total)"

  $rr=(Call-Api POST "/api/v1/spaces/$spId/search/reranked" $tok @{query="zqxkeyword"; topK=10; retrievalCandidateK=50; rerankCandidateK=20; threshold=-1.0})
  $rrBody=$rr.Content|ConvertFrom-Json
  Write-Host "RERANKED status=$($rr.StatusCode) total=$($rrBody.total) topK=$($rrBody.topK) retrievalK=$($rrBody.retrievalCandidateK) rerankK=$($rrBody.rerankCandidateK) provider=$($rrBody.provider) model=$($rrBody.model)"
  if($rr.StatusCode -ne 200){ throw "reranked not 200" }
  if($rrBody.total -gt 0){ Write-Host "FIRST score=$($rrBody.items[0].score)" }

  $empty=(Call-Api POST "/api/v1/spaces/$spId/search/reranked" $tok @{query="nomatchxyz999"; threshold=0.99})
  $emptyBody=$empty.Content|ConvertFrom-Json
  Write-Host "RERANKED_EMPTY status=$($empty.StatusCode) total=$($emptyBody.total)"

  $regB=Call-Api POST "/api/v1/auth/register" $null @{email="rt-lb-$suffix@example.com";password="password123";name="RT LB"}
  $tokB=($regB.Content|ConvertFrom-Json).tokens.accessToken
  try {
    Call-Api POST "/api/v1/spaces/$spId/search/reranked" $tokB @{query="JWT"} | Out-Null
    throw "expected 404"
  } catch {
    if($_.Exception.Response.StatusCode.value__ -ne 404){ throw "expected 404" }
    Write-Host "CROSS_TENANT status=404"
  }

  try {
    Call-Api POST "/api/v1/spaces/$spId/search/reranked" $tok @{query="JWT"; topK=20; rerankCandidateK=5} | Out-Null
    throw "expected 400"
  } catch {
    if($_.Exception.Response.StatusCode.value__ -ne 400){ throw "expected 400" }
    Write-Host "INVALID_RERANK_K status=400"
  }

  Write-Host "RUNTIME_RERANKED_SEARCH_PASS"
} catch {
  Write-Host "RUNTIME_FAIL $($_.Exception.Message)"
  Receive-Job $api,$worker -ErrorAction SilentlyContinue | Select-Object -First 30
  exit 1
} finally {
  Stop-Job $api,$worker -ErrorAction SilentlyContinue
  Remove-Job $api,$worker -Force -ErrorAction SilentlyContinue
}
