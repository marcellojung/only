# Windows PC + Tailscale Funnel 무료 운영

현재 PC에서는 바탕화면 **모아 자산.exe**로 시작·종료·재시작할 수 있습니다. [실행기와 자동화 사용법](IMPLEMENTATION.md)을 먼저 참고하세요. 아래 명령은 새 PC 설치와 관리자 유지보수용이며, 프로젝트 루트에서 실행합니다. 앱 종료 시 기존 Tailscale Funnel 설정은 유지됩니다.

이 구성은 공유기 포트와 별도 도메인을 사용하지 않고 Tailscale Funnel의 `https://...ts.net` 주소로 앱을 엽니다. Tailscale은 Windows 서버에만 설치하며 가족 아이폰에는 설치하지 않아도 됩니다. Windows PC가 켜져 있고 사용자 로그인이 유지되는 동안 사용할 수 있습니다.

## 1. Windows에 필수 프로그램 설치

PowerShell에서 다음 명령을 한 번씩 실행합니다.

```powershell
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install Tailscale.Tailscale
```

설치 후 PowerShell을 다시 열고 Windows의 Tailscale 앱에 로그인합니다. 가족 구성원을 Tailscale에 초대하거나 아이폰에 Tailscale 앱을 설치할 필요는 없습니다.

## 2. 프로젝트와 현재 데이터 옮기기

프로젝트를 Windows의 짧은 영문 경로에 두는 것을 권장합니다.

```text
C:\only-family-assets
```

현재 입력된 자산 데이터를 유지하려면 Mac의 `data/family-assets.db`를 Windows 프로젝트의 동일한 `data` 폴더에 별도로 복사합니다. SQLite DB는 Git에 포함되지 않으므로 USB나 암호화된 개인 저장소로 옮겨야 합니다. DB를 복사할 때는 실행 중인 앱을 먼저 중지하세요.

## 3. 최초 설치와 자동 실행 등록

프로젝트 폴더에서 PowerShell을 열고 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-setup.ps1 -RegisterStartup
```

스크립트는 패키지와 FastAPI 환경을 설치하고, 가족별 임의 비밀번호와 보안 세션 키를 만든 뒤 Tailscale Funnel HTTPS 연결과 Windows 로그인 시 자동 실행을 등록합니다. 기존 `.env.local`의 외부 연동 값은 보존하며, 비어 있거나 약한 가족 비밀번호만 안전한 임의 값으로 채웁니다.

처음 실행할 때 출력되는 `ADMIN_PASSWORD`, `JIWOO_GUEST_PASSWORD`, `YOONJAE_GUEST_PASSWORD`를 비밀번호 관리자 등 안전한 곳에 기록합니다. 각각 성근·지우·윤재 계정에 사용합니다. Funnel 활성화를 승인하는 Tailscale 웹 화면이 열리면 승인합니다.

## 4. 수동 시작·중지

```powershell
# 시작
powershell -ExecutionPolicy Bypass -File .\scripts\windows-start.ps1

# 중지
powershell -ExecutionPolicy Bypass -File .\scripts\windows-stop.ps1

# 접속 주소 확인
tailscale funnel status
```

표시되는 `https://...ts.net` 주소를 가족 아이폰 Safari에서 바로 열고 각자의 계정과 비밀번호로 로그인합니다. 이후 Safari의 **공유 → 홈 화면에 추가**를 선택하면 앱처럼 실행할 수 있습니다.

### 가족 아이폰에서 접속하기

1. 아이폰에는 Tailscale 앱을 설치하지 않습니다.
2. `tailscale funnel status`에 표시된 주소를 Safari에서 엽니다.
3. 본인의 가족 계정으로 로그인합니다.
4. **공유 → 홈 화면에 추가**를 선택합니다.

Funnel 주소는 공개 인터넷에서 열리므로 가족 외부에 공유하지 않습니다. 앱은 HTTPS, 가족별 로그인, 로그인 시도 제한과 HttpOnly 보안 세션으로 보호되지만 강한 비밀번호를 유지해야 합니다.

## 5. 업데이트와 백업

```powershell
.\scripts\windows-stop.ps1
pnpm install --frozen-lockfile
node scripts/setup-backend.mjs
pnpm build
.\scripts\windows-start.ps1
```

`data/family-assets.db`에는 모든 가계부·자산·분석 이력이 들어 있습니다. 앱을 중지한 상태에서 이 파일을 주기적으로 외장 디스크나 개인 클라우드에 복사하세요.

## Node 또는 pnpm을 찾지 못할 때

`node --version`, `npm.cmd`, `pnpm.cmd`를 찾지 못하거나 아래 오류가 나오면 Node 설치 폴더가 Windows `PATH`에 등록되지 않은 상태입니다.

```text
'"node"'은(는) 내부 또는 외부 명령이 아닙니다.
Cannot find module 'C:\only\pnpm'
```

`node.exe pnpm build` 또는 `node.exe npm.cmd`처럼 실행하면 Node가 `pnpm`이나 `npm.cmd`를 JavaScript 파일로 해석하므로 사용하지 않습니다. `node.exe`는 `scripts/setup-backend.mjs` 같은 JavaScript 파일을 실행할 때만 붙입니다.

먼저 npm 설치 여부를 확인합니다.

```powershell
Test-Path "C:\Program Files\nodejs\npm.cmd"
```

결과가 `True`이면 현재 PowerShell에 Node와 npm 전역 경로를 등록하고 프로젝트에서 고정한 pnpm 버전을 설치합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" install --global pnpm@10.17.1

$npmPrefix = & "C:\Program Files\nodejs\npm.cmd" prefix --global
$pnpmPath = Join-Path $npmPrefix "pnpm.cmd"
$env:Path = "C:\Program Files\nodejs;$npmPrefix;$env:Path"

node --version
& $pnpmPath --version
```

Node는 설치된 버전, pnpm은 `10.17.1`이 표시되어야 합니다. 이어서 아래처럼 업데이트합니다.

```powershell
cd C:\only

& $pnpmPath install --frozen-lockfile
node scripts/setup-backend.mjs
& $pnpmPath build

.\scripts\windows-stop.ps1
.\scripts\windows-start.ps1
```

새 PowerShell이나 재부팅 후에도 명령을 찾을 수 있도록 Windows의 **환경 변수 편집 → 사용자 변수 → Path**에 다음 두 경로를 추가합니다. `본인계정`은 실제 Windows 사용자 폴더명으로 바꿉니다.

```text
C:\Program Files\nodejs
C:\Users\본인계정\AppData\Roaming\npm
```

저장한 뒤 PowerShell을 완전히 닫았다가 다시 열어 확인합니다.

```powershell
node --version
pnpm --version
```

## 보안 원칙

- 공유기에서 3000번이나 8000번 포트를 개방하지 않습니다.
- Funnel은 공개 인터넷용이므로 `PUBLIC_ACCESS_MODE=funnel`과 가족별 강한 비밀번호를 유지합니다.
- 로그인 세션은 브라우저 JavaScript에서 읽을 수 없는 HttpOnly 쿠키로 저장됩니다.
- `.env.local`과 `data/family-assets.db`는 Git이나 공개 저장소에 올리지 않습니다.
- 재부팅 후 Windows에 로그인하면 앱이 자동 시작됩니다.
