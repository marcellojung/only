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

function New-RandomSecret {
    param([int]$ByteCount = 24)
    $Bytes = New-Object byte[] $ByteCount
    $Generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    $Generator.GetBytes($Bytes)
    $Generator.Dispose()
    return [Convert]::ToBase64String($Bytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")
}

function Get-EnvValue {
    param([string]$Path, [string]$Name)
    $Line = Get-Content $Path | Where-Object { $_ -match "^\s*$([Regex]::Escape($Name))=" } | Select-Object -Last 1
    if (-not $Line) { return "" }
    return ($Line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

function Set-EnvValue {
    param([string]$Path, [string]$Name, [string]$Value)
    $Content = Get-Content $Path -Raw
    $Pattern = "(?m)^\s*$([Regex]::Escape($Name))=.*$"
    $Replacement = "$Name=$Value"
    if ($Content -match $Pattern) {
        $Content = [Regex]::Replace($Content, $Pattern, $Replacement)
    } else {
        $Content = $Content.TrimEnd() + [Environment]::NewLine + $Replacement + [Environment]::NewLine
    }
    Set-Content -Path $Path -Value $Content -Encoding UTF8
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
    Copy-Item ".env.example" ".env.local"
} else {
    Write-Host "기존 .env.local의 연동 설정을 보존합니다."
}

Set-EnvValue ".env.local" "PUBLIC_ACCESS_MODE" "funnel"

$GeneratedPasswords = @{}
$SecurityValues = @(
    @{ Name = "AUTH_SECRET"; Minimum = 32; Bytes = 32 },
    @{ Name = "ADMIN_PASSWORD"; Minimum = 12; Bytes = 18 },
    @{ Name = "JIWOO_GUEST_PASSWORD"; Minimum = 12; Bytes = 18 },
    @{ Name = "YOONJAE_GUEST_PASSWORD"; Minimum = 12; Bytes = 18 }
)
foreach ($Definition in $SecurityValues) {
    $Current = Get-EnvValue ".env.local" $Definition.Name
    if ($Current.Length -lt $Definition.Minimum -or $Current -like "*change-this*") {
        $Generated = New-RandomSecret $Definition.Bytes
        Set-EnvValue ".env.local" $Definition.Name $Generated
        if ($Definition.Name -ne "AUTH_SECRET") { $GeneratedPasswords[$Definition.Name] = $Generated }
    }
}

if ($GeneratedPasswords.Count -gt 0) {
    Write-Host "새 가족 비밀번호를 만들었습니다. 지금 안전한 곳에 기록하세요." -ForegroundColor Yellow
    foreach ($Name in @("ADMIN_PASSWORD", "JIWOO_GUEST_PASSWORD", "YOONJAE_GUEST_PASSWORD")) {
        if ($GeneratedPasswords.ContainsKey($Name)) { Write-Host "$Name=$($GeneratedPasswords[$Name])" -ForegroundColor Yellow }
    }
}

Write-Host "Node 패키지와 FastAPI 환경을 설치합니다..."
& pnpm.cmd install --frozen-lockfile
& node.exe scripts/setup-backend.mjs
& pnpm.cmd build

Write-Host "Tailscale 로그인을 확인합니다..."
& $TailscaleExe status *> $null
if ($LASTEXITCODE -ne 0) { & $TailscaleExe up }
Write-Host "Tailscale Funnel 공개 HTTPS 연결을 설정합니다..."
& $TailscaleExe funnel --bg 3000

if ($RegisterStartup) {
    $StartScript = Join-Path $ProjectRoot "scripts\windows-start.ps1"
    $TaskAction = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`""
    & schtasks.exe /Create /TN "Only Family Assets" /TR $TaskAction /SC ONLOGON /F | Out-Host
    Write-Host "Windows 로그인 시 자동 실행 작업을 등록했습니다."
}

Write-Host "설치가 끝났습니다. 지금 실행하려면 다음 명령을 사용하세요:"
Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\windows-start.ps1" -ForegroundColor Green
Write-Host "가족 접속 주소는 'tailscale funnel status'에서 확인할 수 있습니다."
& $TailscaleExe funnel status
