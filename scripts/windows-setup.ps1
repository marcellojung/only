param([switch]$RegisterStartup)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

function Require-Command {
    param([string]$Name, [string]$InstallCommand)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name'이 없습니다. 먼저 다음 명령으로 설치한 뒤 PowerShell을 다시 여세요: $InstallCommand"
    }
}

Require-Command "node.exe" "winget install OpenJS.NodeJS.LTS"
Require-Command "py.exe" "winget install Python.Python.3.12"

if (-not (Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue)) {
    Write-Host "pnpm을 설치합니다..."
    & npm.cmd install --global pnpm
}

$TailscaleCommand = Get-Command "tailscale.exe" -ErrorAction SilentlyContinue
if ($TailscaleCommand) {
    $TailscaleExe = $TailscaleCommand.Source
} else {
    $TailscalePath = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
    if (Test-Path $TailscalePath) { $TailscaleExe = $TailscalePath }
    else { throw "Tailscale이 없습니다. 먼저 'winget install Tailscale.Tailscale'을 실행한 뒤 로그인하세요." }
}

if (-not (Test-Path ".env.local")) {
    $RandomBytes = New-Object byte[] 32
    $Generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    $Generator.GetBytes($RandomBytes)
    $Generator.Dispose()
    $AccessKey = [Convert]::ToBase64String($RandomBytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")
    $EnvironmentText = (Get-Content ".env.example" -Raw) -replace "APP_ACCESS_KEY=.*", "APP_ACCESS_KEY=$AccessKey"
    Set-Content -Path ".env.local" -Value $EnvironmentText -Encoding UTF8
    Write-Host "새 접근 키를 .env.local에 만들었습니다. 아이폰에서 입력할 키: $AccessKey" -ForegroundColor Yellow
} else {
    Write-Host ".env.local을 보존했습니다."
}

Write-Host "Node 패키지와 FastAPI 환경을 설치합니다..."
& pnpm.cmd install --frozen-lockfile
& node.exe scripts/setup-backend.mjs
& pnpm.cmd build

Write-Host "Tailscale 로그인을 확인합니다..."
& $TailscaleExe status *> $null
if ($LASTEXITCODE -ne 0) { & $TailscaleExe up }
& $TailscaleExe serve --bg 3000

if ($RegisterStartup) {
    $StartScript = Join-Path $ProjectRoot "scripts\windows-start.ps1"
    $TaskAction = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`""
    & schtasks.exe /Create /TN "Only Family Assets" /TR $TaskAction /SC ONLOGON /F | Out-Host
    Write-Host "Windows 로그인 시 자동 실행 작업을 등록했습니다."
}

Write-Host "설치가 끝났습니다. 지금 실행하려면 다음 명령을 사용하세요:"
Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\windows-start.ps1" -ForegroundColor Green
Write-Host "Tailscale 주소는 'tailscale serve status'에서 확인할 수 있습니다."
& $TailscaleExe serve status
