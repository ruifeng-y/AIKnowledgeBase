$ErrorActionPreference = "Stop"
Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
$suffix = Get-Random
$job = Start-Job -ScriptBlock {
  Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
  $env:JWT_SECRET = "dev-only-change-me"
  $env:JWT_ACCESS_TTL = "15m"
  $env:JWT_REFRESH_TTL = "7d"
  $env:S3_ENDPOINT = "http://localhost:9000"
  $env:S3_ACCESS_KEY_ID = "minioadmin"
  $env:S3_SECRET_ACCESS_KEY = "change_me"
  $env:S3_BUCKET = "ai-knowledge-base"
  node apps/api/dist/main.js *>&1
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
  $health = Invoke-WebRequest "http://127.0.0.1:3001/health" -UseBasicParsing
  Write-Host "HEALTH $($health.StatusCode) $($health.Content)"
  $docs = Invoke-WebRequest "http://127.0.0.1:3001/api/docs" -UseBasicParsing
  Write-Host "DOCS $($docs.StatusCode)"

  $reg = Call-Api POST "/api/v1/auth/register" $null @{ email = "rt-f-$suffix@example.com"; password = "password123"; name = "RT F" }
  $tok = ($reg.Content | ConvertFrom-Json).tokens.accessToken
  $ws = Call-Api POST "/api/v1/workspaces" $tok @{ name = "RT WS"; slug = "rt-ws-f-$suffix" }
  $wsId = ($ws.Content | ConvertFrom-Json).id
  $sp = Call-Api POST "/api/v1/workspaces/$wsId/spaces" $tok @{ name = "RT Space"; slug = "rt-space-f-$suffix" }
  $spId = ($sp.Content | ConvertFrom-Json).id
  $doc = Call-Api POST "/api/v1/spaces/$spId/documents" $tok @{ title = "RT Doc" }
  $docId = ($doc.Content | ConvertFrom-Json).id
  $list = Call-Api GET "/api/v1/spaces/$spId/documents" $tok $null
  $get = Call-Api GET "/api/v1/documents/$docId" $tok $null
  $patch = Call-Api PATCH "/api/v1/documents/$docId" $tok @{ title = "RT Doc v2"; description = "x" }
  Write-Host "CRUD reg=$($reg.StatusCode) ws=$($ws.StatusCode) space=$($sp.StatusCode) doc=$($doc.StatusCode) list=$($list.StatusCode) get=$($get.StatusCode) patch=$($patch.StatusCode)"

  $content = "runtime-minio-content-$suffix"
  $tmp = Join-Path $env:TEMP "rt-note-$suffix.txt"
  [System.IO.File]::WriteAllText($tmp, $content)
  $upJson = & curl.exe -sS -X POST "http://127.0.0.1:3001/api/v1/spaces/$spId/documents/upload" -H "Authorization: Bearer $tok" -F "file=@$tmp;type=text/plain" -F "title=RT Upload"
  $up = $upJson | ConvertFrom-Json
  Write-Host "UPLOAD id=$($up.id) status=$($up.status) key=$($up.metadata.storageKey)"

  $dl = Invoke-WebRequest -Uri "http://127.0.0.1:3001/api/v1/documents/$($up.id)/content" -Headers @{ Authorization = "Bearer $tok" } -UseBasicParsing
  $dlText = if ($dl.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($dl.Content) } else { [string]$dl.Content }
  if ($dlText -like "*runtime-minio-content-$suffix*") { Write-Host "DOWNLOAD $($dl.StatusCode) CONTENT_MATCH=PASS" } else { Write-Host "DOWNLOAD_CONTENT_FAIL=$dlText" }

  $cross = "n/a"
  try { Call-Api GET "/api/v1/documents/00000000-0000-0000-0000-000000000001" $tok $null | Out-Null; $cross = "NOT_404" } catch { $resp=$_.Exception.Response; if ($resp) { $cross=[int]$resp.StatusCode } }
  Write-Host "CROSS_MISSING=$cross"

  $del = Call-Api DELETE "/api/v1/documents/$($up.id)" $tok $null
  $del2 = Call-Api DELETE "/api/v1/documents/$docId" $tok $null
  Call-Api DELETE "/api/v1/workspaces/$wsId" $tok $null | Out-Null
  Write-Host "DELETE delUp=$($del.StatusCode) delDoc=$($del2.StatusCode)"
  Write-Host "RUNTIME_PASS"
} catch {
  Write-Host "RUNTIME_FAIL $($_.Exception.Message)"
  Receive-Job $job | Select-Object -First 30
} finally {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
}
