$ErrorActionPreference = "Stop"
Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
$suffix = Get-Random
$api = Start-Job -ScriptBlock {
  Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
  $env:JWT_SECRET="dev-only-change-me"; $env:JWT_ACCESS_TTL="15m"; $env:JWT_REFRESH_TTL="7d"
  $env:DATABASE_URL="postgresql://akb:change_me@localhost:5432/ai_knowledge_base"
  $env:EMBEDDING_PROVIDER="mock"; $env:EMBEDDING_MODEL="mock-embedding-v1"; $env:EMBEDDING_DIMENSION="384"
  $env:RERANKER_PROVIDER="mock"; $env:RERANKER_MODEL="mock-reranker-v1"
  $env:LLM_PROVIDER="mock"; $env:LLM_MODEL="mock-llm-v1"; $env:LLM_MOCK_MODE="supported_answer"
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
  $reg=Call-Api POST "/api/v1/auth/register" $null @{email="rt-m-$suffix@example.com";password="password123";name="RT M"}
  $tok=($reg.Content|ConvertFrom-Json).tokens.accessToken
  $ws=Call-Api POST "/api/v1/workspaces" $tok @{name="RT WS M";slug="rt-ws-m-$suffix"}
  $sp=Call-Api POST "/api/v1/workspaces/$(($ws.Content|ConvertFrom-Json).id)/spaces" $tok @{name="RT Space M";slug="rt-space-m-$suffix"}
  $spId=($sp.Content|ConvertFrom-Json).id
  $tmp=Join-Path $env:TEMP "rt-m-$suffix.md"
  [System.IO.File]::WriteAllText($tmp, "# JWT`n`nJWT authentication token explanation content.")
  $up=((& curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$spId/documents/upload" -H "Authorization: Bearer $tok" -F "file=@$tmp;type=text/markdown") | ConvertFrom-Json)
  $docId=$up.id
  for($i=0;$i -lt 25;$i++){
    Start-Sleep -Seconds 1
    $st=(Call-Api GET "/api/v1/documents/$docId/processing" $tok $null).Content|ConvertFrom-Json
    if($st.documentStatus -eq "READY"){break}
  }
  Write-Host "DOC status=$($st.documentStatus)"

  $vec=(Call-Api POST "/api/v1/spaces/$spId/search/vector" $tok @{query="JWT"; threshold=-1.0})
  Write-Host "VECTOR status=$($vec.StatusCode)"
  $hy=(Call-Api POST "/api/v1/spaces/$spId/search/hybrid" $tok @{query="JWT"})
  Write-Host "HYBRID status=$($hy.StatusCode)"
  $rr=(Call-Api POST "/api/v1/spaces/$spId/search/reranked" $tok @{query="JWT"; threshold=-1.0})
  Write-Host "RERANKED status=$($rr.StatusCode)"

  $rag=(Call-Api POST "/api/v1/spaces/$spId/rag/query" $tok @{query="JWT authentication"; contextTopK=8; contextTokenBudget=6000})
  $ragBody=$rag.Content|ConvertFrom-Json
  Write-Host "RAG status=$($rag.StatusCode) citations=$($ragBody.citations.Count) itemCount=$($ragBody.context.itemCount) model=$($ragBody.model.model)"
  if($rag.StatusCode -ne 200){ throw "rag not 200" }
  if(-not ($ragBody.answer -match '\[C\d+\]')){ throw "expected citation" }
  if($null -ne $ragBody.systemPrompt){ throw "must not expose systemPrompt" }

  $empty=(Call-Api POST "/api/v1/spaces/$spId/rag/query" $tok @{query="nomatchzzz"})
  $emptyBody=$empty.Content|ConvertFrom-Json
  Write-Host "RAG_EMPTY status=$($empty.StatusCode) itemCount=$($emptyBody.context.itemCount)"
  if($emptyBody.citations.Count -ne 0){ throw "empty should have no citations" }

  $regB=Call-Api POST "/api/v1/auth/register" $null @{email="rt-mb-$suffix@example.com";password="password123";name="RT MB"}
  $tokB=($regB.Content|ConvertFrom-Json).tokens.accessToken
  try {
    Call-Api POST "/api/v1/spaces/$spId/rag/query" $tokB @{query="JWT"} | Out-Null
    throw "expected 404"
  } catch {
    if($_.Exception.Response.StatusCode.value__ -ne 404){ throw "expected 404" }
    Write-Host "CROSS_TENANT status=404"
  }

  try {
    Call-Api POST "/api/v1/spaces/$spId/rag/query" $tok @{query="JWT"; contextTopK=13} | Out-Null
    throw "expected 400"
  } catch {
    if($_.Exception.Response.StatusCode.value__ -ne 400){ throw "expected 400" }
    Write-Host "INVALID_CONTEXT_TOP_K status=400"
  }

  Write-Host "RUNTIME_GROUNDED_RAG_PASS"
} catch {
  Write-Host "RUNTIME_FAIL $($_.Exception.Message)"
  Receive-Job $api,$worker -ErrorAction SilentlyContinue | Select-Object -First 30
  exit 1
} finally {
  Stop-Job $api,$worker -ErrorAction SilentlyContinue
  Remove-Job $api,$worker -Force -ErrorAction SilentlyContinue
}
