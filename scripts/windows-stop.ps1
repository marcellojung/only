$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidFile = Join-Path $ProjectRoot "data\only-family-assets.pid"

if (Test-Path $PidFile) {
    $AppPid = [int](Get-Content $PidFile -Raw)
    & taskkill.exe /PID $AppPid /T /F | Out-Null
    Remove-Item $PidFile -Force
}

$Tailscale = Get-Command "tailscale.exe" -ErrorAction SilentlyContinue
if ($Tailscale) {
    & $Tailscale.Source funnel reset | Out-Null
} else {
    $Candidate = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
    if (Test-Path $Candidate) { & $Candidate funnel reset | Out-Null }
}

Write-Host "모아 자산 앱과 Tailscale Funnel 공개 연결을 중지했습니다."
