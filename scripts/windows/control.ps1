param([ValidateSet('Start','Stop','Restart','Status')][string]$Action = 'Start')
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$DataDirectory = Join-Path $ProjectRoot 'data'
$InstanceFile = Join-Path $DataDirectory 'only-launcher.json'
$StopFile = Join-Path $DataDirectory 'only-stop.json'
$ServeScript = Join-Path $ProjectRoot 'scripts\serve.mjs'
Set-Location -LiteralPath $ProjectRoot

function Test-AppReady {
    try {
        $Health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 3
        return ($Health.app -eq 'only-family-assets' -and $Health.ready -eq $true)
    } catch { return $false }
}
function Get-OwnedInstance {
    if (-not (Test-Path -LiteralPath $InstanceFile)) { return $null }
    $Record = Get-Content -LiteralPath $InstanceFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($Record.root -ne $ProjectRoot -or -not $Record.instance) { throw '실행 기록의 프로젝트 경로를 확인해 주세요.' }
    $Running = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$Record.pid)"
    if (-not $Running) { return $null }
    if ($Running.Name -ne 'node.exe' -or -not $Running.CommandLine.Contains($ServeScript)) { throw 'PID가 다른 프로그램에 사용 중입니다. 해당 프로그램은 종료하지 않습니다.' }
    $Started = [DateTimeOffset]::Parse($Record.startedAt).UtcDateTime
    if ([Math]::Abs(($Running.CreationDate.ToUniversalTime() - $Started).TotalSeconds) -gt 15) { throw '실행 기록과 프로세스 시작 시각이 다릅니다.' }
    return $Record
}
function Stop-App {
    $Record = Get-OwnedInstance
    if (-not $Record) {
        if (Test-AppReady) { throw '다른 방식으로 시작한 앱입니다. 기존 실행 창에서 종료한 뒤 실행기를 사용해 주세요.' }
        Write-Output '앱이 실행 중이지 않습니다.'; return
    }
    [IO.File]::WriteAllText($StopFile, (@{ instance = $Record.instance } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
    for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
        Start-Sleep -Milliseconds 500
        if (-not (Get-OwnedInstance)) { Write-Output '앱을 종료했습니다.'; return }
    }
    throw '종료 대기 시간이 초과되었습니다. 실행 로그를 확인해 주세요.'
}
function Start-App {
    if (Test-AppReady) { Write-Output '앱이 이미 실행 중입니다.'; return }
    $Record = Get-OwnedInstance
    if (-not $Record) {
        $Occupied = Get-NetTCPConnection -State Listen -LocalPort 3000,8000 -ErrorAction SilentlyContinue
        if ($Occupied) { throw '3000 또는 8000번 포트를 사용 중입니다. 기존 앱 실행 창에서 종료 후 다시 시작해 주세요.' }
        $Node = (Get-Command node.exe -ErrorAction Stop).Source
        if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot '.next\BUILD_ID'))) { throw '운영 빌드가 없습니다. 개발 작업에서 빌드를 완료해야 합니다.' }
        New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
        Start-Process -FilePath $Node -ArgumentList @('"' + $ServeScript + '"') -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $DataDirectory 'launcher.stdout.log') -RedirectStandardError (Join-Path $DataDirectory 'launcher.stderr.log') | Out-Null
    }
    for ($Attempt = 0; $Attempt -lt 90; $Attempt++) {
        if (Test-AppReady) { Write-Output '앱 실행 완료'; return }
        Start-Sleep -Milliseconds 500
        if ($Attempt -gt 6 -and -not (Get-OwnedInstance)) { throw '서버 실행에 실패했습니다. 로그 보기에서 오류를 확인해 주세요.' }
    }
    throw '서버 준비 시간이 초과되었습니다. 로그 보기에서 상태를 확인해 주세요.'
}
$Gate = [Threading.Mutex]::new($false, 'Local\MoaOnlyLauncherControl')
$Acquired = $false
try {
    try { $Acquired = $Gate.WaitOne(0) } catch [Threading.AbandonedMutexException] { $Acquired = $true }
    if (-not $Acquired) { throw '다른 실행/종료 작업이 진행 중입니다. 잠시 후 다시 눌러 주세요.' }
    switch ($Action) {
        'Start' { Start-App }
        'Stop' { Stop-App }
        'Restart' { Stop-App; Start-App }
        'Status' { if (Test-AppReady) { Write-Output '실행 중' } else { Write-Output '중지 또는 준비 중' } }
    }
} catch { Write-Output $_.Exception.Message; exit 1 }
finally { if ($Acquired) { $Gate.ReleaseMutex() }; $Gate.Dispose() }
