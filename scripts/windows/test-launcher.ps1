param([int]$MaximumSeconds = 45)
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$Executable = Join-Path $ProjectRoot 'dist\launcher\Moa.exe'
$Assembly = [Reflection.Assembly]::LoadFile($Executable)
$LauncherType = $Assembly.GetType('MoaLauncher', $true)
$Execute = $LauncherType.GetMethod('Execute', [Reflection.BindingFlags]'NonPublic,Static')

# Exercise the compiled EXE's command bridge, not only the PowerShell script.
# A successful test must return while both background servers remain alive.
foreach ($Action in @('Restart', 'Start', 'Restart')) {
    $Timer = [Diagnostics.Stopwatch]::StartNew()
    $Result = $Execute.Invoke($null, [object[]]@($ProjectRoot, $Action))
    $Timer.Stop()
    if ($Result.Item1 -ne 0) { throw "$Action failed: $($Result.Item2)" }
    if ($Timer.Elapsed.TotalSeconds -gt $MaximumSeconds) { throw "$Action took too long: $($Timer.Elapsed.TotalSeconds) seconds" }
    $Health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 5
    if ($Health.app -ne 'only-family-assets' -or -not $Health.ready) { throw 'Application is not ready after command completion' }
    Write-Output ("PASS {0}: returned in {1:N1}s with servers still running" -f $Action, $Timer.Elapsed.TotalSeconds)
}
