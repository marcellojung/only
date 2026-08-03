# Windows PC + Tailscale 무료 운영

이 구성은 공유기 포트를 열지 않고, Tailscale에 로그인한 두 사람의 아이폰에서만 앱을 열 수 있게 합니다. Windows PC가 켜져 있고 사용자 로그인이 유지되는 동안 사용할 수 있습니다.

## 1. Windows에 필수 프로그램 설치

PowerShell에서 다음 명령을 한 번씩 실행합니다.

```powershell
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install Tailscale.Tailscale
```

설치 후 PowerShell을 다시 열고 Tailscale 앱에 로그인합니다. Tailscale 관리 화면에서 배우자를 사용자로 초대하고 두 아이폰에도 Tailscale 앱을 설치해 같은 비공개 네트워크에 연결합니다.

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

스크립트는 패키지와 FastAPI 환경을 설치하고, 운영 빌드와 임의 접근 키를 만든 뒤 Tailscale HTTPS 연결과 Windows 로그인 시 자동 실행을 등록합니다. 기존 `.env.local`은 덮어쓰지 않습니다.

## 4. 수동 시작·중지

```powershell
# 시작
powershell -ExecutionPolicy Bypass -File .\scripts\windows-start.ps1

# 중지
powershell -ExecutionPolicy Bypass -File .\scripts\windows-stop.ps1

# 접속 주소 확인
tailscale serve status
```

표시되는 `https://...ts.net` 주소를 아이폰 Safari에서 열고 접근 키를 입력합니다. 이후 Safari의 **공유 → 홈 화면에 추가**를 선택하면 앱처럼 실행할 수 있습니다.

## 5. 업데이트와 백업

```powershell
.\scripts\windows-stop.ps1
pnpm install --frozen-lockfile
node scripts/setup-backend.mjs
pnpm build
.\scripts\windows-start.ps1
```

`data/family-assets.db`에는 모든 가계부·자산·분석 이력이 들어 있습니다. 앱을 중지한 상태에서 이 파일을 주기적으로 외장 디스크나 개인 클라우드에 복사하세요.

## 보안 원칙

- 공유기에서 3000번이나 8000번 포트를 개방하지 않습니다.
- Tailscale Funnel은 사용하지 않습니다. Funnel은 공개 인터넷용 기능입니다.
- `.env.local`과 `data/family-assets.db`는 Git이나 공개 저장소에 올리지 않습니다.
- 재부팅 후 Windows에 로그인하면 앱이 자동 시작됩니다.
