$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidFile = Join-Path $ProjectRoot "data\only-family-assets.pid"

if (Test-Path $PidFile) {
    $AppPid = [int](Get-Content $PidFile -Raw)
    & taskkill.exe /PID $AppPid /T /F | Out-Null
    Remove-Item $PidFile -Force
}

Write-Host "온리 자산 앱을 중지했습니다. Tailscale 비공개 네트워크는 유지됩니다."
