param([switch]$InstallDesktop)
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$BuildDirectory = Join-Path $ProjectRoot 'dist\launcher'
New-Item -ItemType Directory -Path $BuildDirectory -Force | Out-Null
$Resource = Join-Path $BuildDirectory 'project-root.txt'
[IO.File]::WriteAllText($Resource, $ProjectRoot, [Text.UTF8Encoding]::new($false))
$Compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $Compiler)) { $Compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$Executable = Join-Path $BuildDirectory 'Moa.exe'
& $Compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/resource:$Resource,Moa.ProjectRoot" "/out:$Executable" (Join-Path $PSScriptRoot 'MoaLauncher.cs')
if ($LASTEXITCODE -ne 0) { throw 'EXE 컴파일에 실패했습니다.' }
$Check = Start-Process -FilePath $Executable -ArgumentList '--check' -PassThru -Wait -WindowStyle Hidden
if ($Check.ExitCode -ne 0) { throw 'EXE 실행 환경 확인에 실패했습니다.' }
Write-Output "실행기 생성 완료: $Executable"
if ($InstallDesktop) {
    $DesktopDirectory = [Environment]::GetFolderPath('Desktop')
    if (-not $DesktopDirectory -or -not (Test-Path -LiteralPath $DesktopDirectory)) { throw '현재 사용자의 바탕화면을 찾지 못했습니다.' }
    $Target = Join-Path $DesktopDirectory '모아 자산.exe'
    if (Test-Path -LiteralPath $Target) { throw '바탕화면에 같은 이름의 파일이 있습니다. 기존 파일을 확인해 주세요.' }
    Copy-Item -LiteralPath $Executable -Destination $Target
    Write-Output "바탕화면 설치 완료: $Target"
}
