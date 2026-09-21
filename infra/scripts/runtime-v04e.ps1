$ErrorActionPreference = "Stop"
Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
$suffix = Get-Random
$job = Start-Job -ScriptBlock {
  Set-Location "D:\AI\WorkSpace\XiaomiMiMoProjects\AIKnowledgeBase"
  $env:JWT_SECRET = "dev-only-change-me"
  $env:JWT_ACCESS_TTL = "15m"
  $env:JWT_REFRESH_TTL = "7d"
  $env:CORS_ORIGINS = "http://localhost:3000"
  node apps/api/dist/main.js *>&1
}
Start-Sleep -Seconds 6

function Call-Api {
  param($Method, $Path, $Token, $Body)
  $headers = @{ "Content-Type" = "application/json" }
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  if ($null -ne $Body) {
    return Invoke-WebRequest -Uri "http://127.0.0.1:3001$Path" -Method $Method -Headers $headers -Body ($Body | ConvertTo-Json) -UseBasicParsing
  }
  return Invoke-WebRequest -Uri "http://127.0.0.1:3001$Path" -Method $Method -Headers $headers -UseBasicParsing
}

try {
  $health = Invoke-WebRequest "http://127.0.0.1:3001/health" -UseBasicParsing
  Write-Host "HEALTH $($health.StatusCode) $($health.Content)"
  $docs = Invoke-WebRequest "http://127.0.0.1:3001/api/docs" -UseBasicParsing
  Write-Host "DOCS $($docs.StatusCode)"

  $userA = @{ email = "rt-a-$suffix@example.com"; password = "password123"; name = "RT A" }
  $userB = @{ email = "rt-b-$suffix@example.com"; password = "password123"; name = "RT B" }
  $regA = Call-Api POST "/api/v1/auth/register" $null $userA
  $regB = Call-Api POST "/api/v1/auth/register" $null $userB
  $tokA = ($regA.Content | ConvertFrom-Json).tokens.accessToken
  $tokB = ($regB.Content | ConvertFrom-Json).tokens.accessToken
  Write-Host "REGISTER A=$($regA.StatusCode) B=$($regB.StatusCode)"

  $login = Call-Api POST "/api/v1/auth/login" $null @{ email = $userA.email; password = $userA.password }
  $refreshTok = ($login.Content | ConvertFrom-Json).tokens.refreshToken
  $ref = Call-Api POST "/api/v1/auth/refresh" $null @{ refreshToken = $refreshTok }
  Write-Host "LOGIN=$($login.StatusCode) REFRESH=$($ref.StatusCode)"

  $me = Call-Api GET "/api/v1/users/me" $tokA $null
  Write-Host "ME=$($me.StatusCode) $((($me.Content | ConvertFrom-Json).email))"

  $wsA = Call-Api POST "/api/v1/workspaces" $tokA @{ name = "RT WS A"; slug = "rt-ws-a-$suffix" }
  $wsB = Call-Api POST "/api/v1/workspaces" $tokB @{ name = "RT WS B"; slug = "rt-ws-b-$suffix" }
  $wsAId = ($wsA.Content | ConvertFrom-Json).id
  $wsBId = ($wsB.Content | ConvertFrom-Json).id
  Write-Host "WS_CREATE A=$($wsA.StatusCode) B=$($wsB.StatusCode)"

  $list = Call-Api GET "/api/v1/workspaces" $tokA $null
  $own = Call-Api GET "/api/v1/workspaces/$wsAId" $tokA $null
  $crossStatus = "n/a"
  try {
    Call-Api GET "/api/v1/workspaces/$wsBId" $tokA $null | Out-Null
    $crossStatus = "NOT_404"
  } catch {
    $resp = $_.Exception.Response
    if ($resp) { $crossStatus = [int]$resp.StatusCode } else { $crossStatus = "ERR" }
  }
  Write-Host "WS_LIST=$($list.StatusCode) WS_OWN=$($own.StatusCode) WS_CROSS_A_TO_B=$crossStatus"

  $spA = Call-Api POST "/api/v1/workspaces/$wsAId/spaces" $tokA @{ name = "RT Space A"; slug = "rt-space-a-$suffix" }
  $spB = Call-Api POST "/api/v1/workspaces/$wsBId/spaces" $tokB @{ name = "RT Space B"; slug = "rt-space-b-$suffix" }
  $spAId = ($spA.Content | ConvertFrom-Json).id
  $spBId = ($spB.Content | ConvertFrom-Json).id
  $spaceCross = "n/a"
  try {
    Call-Api GET "/api/v1/spaces/$spBId" $tokA $null | Out-Null
    $spaceCross = "NOT_404"
  } catch {
    $resp = $_.Exception.Response
    if ($resp) { $spaceCross = [int]$resp.StatusCode } else { $spaceCross = "ERR" }
  }
  Write-Host "SPACE_CREATE A=$($spA.StatusCode) B=$($spB.StatusCode) SPACE_CROSS_A_TO_B=$spaceCross"

  $patchWs = Call-Api PATCH "/api/v1/workspaces/$wsAId" $tokA @{ name = "RT WS A2" }
  $patchSp = Call-Api PATCH "/api/v1/spaces/$spAId" $tokA @{ description = "updated" }
  Write-Host "PATCH_WS=$($patchWs.StatusCode) PATCH_SP=$($patchSp.StatusCode)"

  $delSp = Call-Api DELETE "/api/v1/spaces/$spAId" $tokA $null
  $delWs = Call-Api DELETE "/api/v1/workspaces/$wsAId" $tokA $null
  Call-Api DELETE "/api/v1/spaces/$spBId" $tokB $null | Out-Null
  Call-Api DELETE "/api/v1/workspaces/$wsBId" $tokB $null | Out-Null
  Write-Host "DELETE_SP=$($delSp.StatusCode) DELETE_WS=$($delWs.StatusCode)"
  Write-Host "RUNTIME_PASS"
} catch {
  Write-Host "RUNTIME_FAIL $($_.Exception.Message)"
  Receive-Job $job | Select-Object -First 40
} finally {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
}
