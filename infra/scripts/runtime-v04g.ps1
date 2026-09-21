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
  $env:S3_ENDPOINT="http://localhost:9000"; $env:S3_ACCESS_KEY_ID="minioadmin"; $env:S3_SECRET_ACCESS_KEY="change_me"; $env:S3_BUCKET="ai-knowledge-base"
  node apps/worker/dist/main.js *>&1
}
Start-Sleep -Seconds 6

function Call-Api {
  param($Method, $Path, $Token, $Body)
  $headers = @{}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  if ($null -ne $Body) {
    $headers["Content-Type"] = "application/json"
    return Invoke-WebRequest -Uri "http://127.0.0.1:3001$Path" -Method $Method -Headers $headers -Body ($Body | ConvertTo-Json) -UseBasicParsing
  }
  return Invoke-WebRequest -Uri "http://127.0.0.1:3001$Path" -Method $Method -Headers $headers -UseBasicParsing
}

try {
  $reg = Call-Api POST "/api/v1/auth/register" $null @{ email="rt-g-$suffix@example.com"; password="password123"; name="RT G" }
  $tok = ($reg.Content | ConvertFrom-Json).tokens.accessToken
  $ws = Call-Api POST "/api/v1/workspaces" $tok @{ name="RT WS"; slug="rt-ws-g-$suffix" }
  $sp = Call-Api POST "/api/v1/workspaces/$(($ws.Content|ConvertFrom-Json).id)/spaces" $tok @{ name="RT Space"; slug="rt-space-g-$suffix" }
  $spId = ($sp.Content | ConvertFrom-Json).id
  $tmp = Join-Path $env:TEMP "rt-g-$suffix.md"
  [System.IO.File]::WriteAllText($tmp, "# Runtime`n`nprocessing body `n`n## Sec`n`nmore text")
  $upJson = & curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$spId/documents/upload" -H "Authorization: Bearer $tok" -F "file=@$tmp;type=text/markdown" -F "title=RT Process"
  $up = $upJson | ConvertFrom-Json
  Write-Host "UPLOAD status=$($up.status) id=$($up.id)"
  $st1 = Call-Api GET "/api/v1/documents/$($up.id)/processing" $tok $null
  Write-Host "PROCESSING_API1 $($st1.StatusCode) $($st1.Content)"

  # wait for worker
  $ready = $false
  for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $st = Call-Api GET "/api/v1/documents/$($up.id)/processing" $tok $null
    $body = $st.Content | ConvertFrom-Json
    if ($body.documentStatus -eq "READY") { $ready=$true; Write-Host "READY after $($i+1)s job=$($body.jobStatus)"; break }
    if ($body.documentStatus -eq "FAILED") { Write-Host "FAILED $($st.Content)"; break }
    Write-Host "wait $($i+1)s status=$($body.documentStatus)"
  }
  if (-not $ready) { Write-Host "READY_TIMEOUT" } else { Write-Host "RUNTIME_PROCESS_PASS" }

  $repro = Call-Api POST "/api/v1/documents/$($up.id)/reprocess" $tok $null
  Write-Host "REPROCESS $($repro.StatusCode) $($repro.Content)"
  Start-Sleep -Seconds 3
  $st2 = Call-Api GET "/api/v1/documents/$($up.id)/processing" $tok $null
  Write-Host "AFTER_REPROCESS $($st2.Content)"
  Write-Host "RUNTIME_PASS"
} catch {
  Write-Host "RUNTIME_FAIL $($_.Exception.Message)"
} finally {
  Stop-Job $api,$worker -ErrorAction SilentlyContinue
  Remove-Job $api,$worker -Force -ErrorAction SilentlyContinue
}
