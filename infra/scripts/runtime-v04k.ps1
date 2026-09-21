$ErrorActionPreference = "Stop"
Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
$suffix = Get-Random
$api = Start-Job -ScriptBlock {
  Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
  $env:JWT_SECRET="dev-only-change-me"; $env:JWT_ACCESS_TTL="15m"; $env:JWT_REFRESH_TTL="7d"
  $env:DATABASE_URL="postgresql://akb:change_me@localhost:5432/ai_knowledge_base"
  $env:EMBEDDING_PROVIDER="mock"; $env:EMBEDDING_MODEL="mock-embedding-v1"; $env:EMBEDDING_DIMENSION="384"
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
  $reg=Call-Api POST "/api/v1/auth/register" $null @{email="rt-k-$suffix@example.com";password="password123";name="RT K"}
  $tok=($reg.Content|ConvertFrom-Json).tokens.accessToken
  $ws=Call-Api POST "/api/v1/workspaces" $tok @{name="RT WS K";slug="rt-ws-k-$suffix"}
  $sp=Call-Api POST "/api/v1/workspaces/$(($ws.Content|ConvertFrom-Json).id)/spaces" $tok @{name="RT Space K";slug="rt-space-k-$suffix"}
  $spId=($sp.Content|ConvertFrom-Json).id
  $tmp=Join-Path $env:TEMP "rt-k-$suffix.md"
  [System.IO.File]::WriteAllText($tmp, "# JWT`n`nJWT authentication token explanation content. zqxkeyword unique.")
  $up=((& curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$spId/documents/upload" -H "Authorization: Bearer $tok" -F "file=@$tmp;type=text/markdown") | ConvertFrom-Json)
  $docId=$up.id; $verId=$up.currentVersionId
  for($i=0;$i -lt 25;$i++){
    Start-Sleep -Seconds 1
    $st=(Call-Api GET "/api/v1/documents/$docId/processing" $tok $null).Content|ConvertFrom-Json
    if($st.documentStatus -eq "READY"){break}
  }
  Write-Host "DOC status=$($st.documentStatus)"

  $lex=(Call-Api POST "/api/v1/spaces/$spId/search/hybrid" $tok @{query="zqxkeyword"; threshold=0.99})
  $lexBody=$lex.Content|ConvertFrom-Json
  Write-Host "HYBRID_LEX status=$($lex.StatusCode) total=$($lexBody.total) topK=$($lexBody.topK) candidateK=$($lexBody.candidateK)"

  $vec=(Call-Api POST "/api/v1/spaces/$spId/search/vector" $tok @{query="JWT authentication"; threshold=-1.0})
  $vecBody=$vec.Content|ConvertFrom-Json
  Write-Host "VECTOR status=$($vec.StatusCode) total=$($vecBody.total)"

  $hy=(Call-Api POST "/api/v1/spaces/$spId/search/hybrid" $tok @{query="JWT authentication zqxkeyword"; topK=10; candidateK=50; threshold=-1.0})
  $hyBody=$hy.Content|ConvertFrom-Json
  Write-Host "HYBRID status=$($hy.StatusCode) total=$($hyBody.total) score0=$($hyBody.items[0].score)"
  if($hy.StatusCode -ne 200){ throw "hybrid not 200" }

  $empty=(Call-Api POST "/api/v1/spaces/$spId/search/hybrid" $tok @{query="nomatchxyz123"; threshold=0.99})
  $emptyBody=$empty.Content|ConvertFrom-Json
  Write-Host "HYBRID_EMPTY status=$($empty.StatusCode) total=$($emptyBody.total)"

  $regB=Call-Api POST "/api/v1/auth/register" $null @{email="rt-kb-$suffix@example.com";password="password123";name="RT KB"}
  $tokB=($regB.Content|ConvertFrom-Json).tokens.accessToken
  try {
    Call-Api POST "/api/v1/spaces/$spId/search/hybrid" $tokB @{query="JWT"} | Out-Null
    throw "expected 404"
  } catch {
    if($_.Exception.Response.StatusCode.value__ -ne 404){ throw "expected 404" }
    Write-Host "CROSS_TENANT status=404"
  }

  try {
    Call-Api POST "/api/v1/spaces/$spId/search/hybrid" $tok @{query="JWT"; topK=20; candidateK=5} | Out-Null
    throw "expected 400 candidateK"
  } catch {
    $code=$_.Exception.Response.StatusCode.value__
    if($code -ne 400){ throw "expected 400 got $code" }
    Write-Host "INVALID_CANDIDATE_K status=400"
  }

  Write-Host "RUNTIME_HYBRID_SEARCH_PASS"
} catch {
  Write-Host "RUNTIME_FAIL $($_.Exception.Message)"
  Receive-Job $api,$worker -ErrorAction SilentlyContinue | Select-Object -First 30
  exit 1
} finally {
  Stop-Job $api,$worker -ErrorAction SilentlyContinue
  Remove-Job $api,$worker -Force -ErrorAction SilentlyContinue
}
