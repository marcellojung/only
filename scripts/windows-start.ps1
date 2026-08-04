$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

$Tailscale = Get-Command "tailscale.exe" -ErrorAction SilentlyContinue
if ($Tailscale) {
    $TailscaleExe = $Tailscale.Source
} else {
    $Candidate = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
    if (Test-Path $Candidate) { $TailscaleExe = $Candidate }
}
if (-not $TailscaleExe) { throw "Tailscale을 찾지 못했습니다." }

& $TailscaleExe serve --bg 3000 | Out-Host
Write-Host "모아 자산 앱을 시작합니다. 이 창을 닫으면 앱도 종료됩니다."
& node.exe scripts/serve.mjs
