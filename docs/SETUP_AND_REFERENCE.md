# 설치·실행 참고서

내 PC에서 앱을 처음 실행하는 순서를 설명합니다. 전체 개념과 파일별 역할은 [README](../README.md), 클라우드 구축은 [NCP 설정](NCLOUD_SETUP.md)에서 이어서 읽습니다.
공개본에는 실제 사용자 데이터와 키가 없으며 기본 demo도 유료 외부 AI를 호출하지 않습니다.

## 1. 폴더와 도구 확인

GitHub에서 clone하거나 압축을 실제 폴더로 풉니다. 압축파일 안을 탐색하는 상태에서 실행하지 않습니다.
Node.js 22.13.0 이상이 필요하며 서버 안내는 Node.js 24를 기준으로 합니다.
없다면 [Node.js 공식 다운로드](https://nodejs.org/en/download)에서 Windows용 24 버전 설치 파일을 받아 실행합니다.
npm과 실행 경로를 추가하는 기본 선택을 유지합니다. Git도 [공식 Windows 안내](https://git-scm.com/install/windows)에서 설치합니다.
설치 후 기존 PowerShell을 닫고 새 창을 엽니다. 프로그램 설치와 아래 프로젝트의 npm ci는 다른 작업입니다.
Windows PowerShell에서 확인합니다.

```powershell
node -v
npm.cmd -v
git --version
```

각 명령에 버전이 나오면 실행할 준비가 된 상태입니다. 방금 설치했는데 명령을 찾지 못하면 PowerShell을 새로 열어 경로를 반영합니다.
입력 표시 앞에 PS가 있는 PowerShell 창에서 실행합니다. CMD에서는 이 문서의 PowerShell 문법을 사용할 수 없습니다.

## 2. 코드 내려받기

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Documents\projects"
Set-Location "$env:USERPROFILE\Documents\projects"
git clone https://github.com/tw-kang01/2026-NCP-Above-Picture.git
Set-Location .\2026-NCP-Above-Picture
Get-ChildItem package.json
```

이미 내려받았다면 해당 폴더로 이동하고 package.json이 보이는지 확인합니다. npm 프로젝트 명령은 이 위치에서 실행합니다.
Set-Location으로 바꾸는 것은 현재 작업 폴더이며 소스 파일의 내용은 바뀌지 않습니다.

## 3. demo 실행

```powershell
npm.cmd ci
npm.cmd run dev
```

npm ci는 잠금 파일에 맞춰 패키지를 설치하고 node_modules 폴더에 라이브러리를 내려받습니다. run dev로 개발 서버를 켠 뒤 Ready가 나오면 http://127.0.0.1:3000을 엽니다.
127.0.0.1은 브라우저가 실행되는 컴퓨터 자신을 가리킵니다. 휴대폰에서 이 주소를 열면 휴대폰 자신에게 접속하므로 내 PC의 앱은 볼 수 없습니다.

기본 demo는 사진을 실제 분석하지 않고 정해진 질문과 사용자의 답변을 사용합니다. 화면·전송·저장·원문·편집 흐름을 익힐 때 쓰면 됩니다.

## 4. 한 번 완주하기

1. 새 기억 작성으로 들어갑니다.
2. 날짜·선택 장소·질문 수 1~10을 정합니다.
3. 사진 1~3장을 고르고 확대를 시험합니다.
4. 질문에 답하거나 건너뜁니다.
5. 적어도 하나의 실제 답변으로 초안을 만듭니다.
6. 질문과 답변 원문을 펼쳐 봅니다.
7. 제목·본문을 고치고 저장합니다.
8. 목록·새로고침·다시 열기로 유지 여부를 확인합니다.

저장 전 초안을 다시 만들면 편집 중인 글이 바뀔 수 있습니다. 필요한 문장은 먼저 복사합니다.
입력창의 수정은 저장 API가 성공해야 서버에 남습니다.

## 5. 설정 파일

설정을 명시하려면 예시를 복사합니다.

```powershell
Copy-Item .env.example .env.local
```

APP_MODE=demo에는 클라우드 키가 필요하지 않지만 실제 NCP를 사용하려면 ncloud와 모든 필수 설정을 준비해야 합니다.
.env.local은 Git에 올리거나 다른 사람에게 보내지 않습니다. 설정을 수정하면 서버를 다시 시작하고 값이 있다는 것과 실제 외부 연결이 성공하는지는 따로 확인합니다.

## 6. 종료와 실행용 빌드

서버 창에서 Ctrl+C로 종료합니다. 다시 쓸 때는 프로젝트 폴더에서 run dev만 실행하면 됩니다.
빌드 결과로 실행하려면 기존 dev를 종료하고 다음 순서로 진행합니다.

```powershell
npm.cmd run build
npm.cmd start
```

build는 .next에 실행 결과를 만들고 start는 그 결과를 실행하므로 소스를 바꾸면 다시 빌드합니다.
PC를 끄면 로컬 서버도 멈춥니다. PC 없이 계속 운영하려면 [NCP 자동 실행](ALWAYS_ON_NCP.md)을 적용합니다.

## 7. 데이터와 검사

demo 기록은 .data/memories, 사진은 .data/app-photos에 저장합니다. 실제 내용이 생기므로 Git·ZIP에서 제외합니다.
다른 브라우저·쿠키에서는 다른 소유자로 보입니다. 쿠키 삭제 후 복구 기능은 없습니다.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:app
npm.cmd run check:publish
```

test:app은 격리된 demo 경로에서 HTTP를 검사하며 실제 계정의 유료 AI를 호출하지 않습니다.
check:publish는 공개할 파일에 금지 파일·민감값·깨진 문서 링크가 있는지 보조 점검합니다.

## 8. 흔한 오류

| 현상 | 확인 |
|---|---|
| npm을 찾지 못함 | Node 설치·새 터미널·PATH |
| package.json 없음 | 프로젝트 최상위인지 |
| 3000 사용 중 | 이전 dev/start 종료 |
| 화면은 열리나 AI가 아님 | demo인지 |
| 기록이 안 보임 | 같은 주소·브라우저·쿠키인지 |
| 저장 후 문장이 다름 | 최신 서버 응답·version 확인 |
| 실제 이미지 업로드 실패 | JPG·PNG·WebP 및 용량 |

오류는 기대 결과·작업 순서·HTTP 상태·error.code·requestId를 남깁니다. 비밀 값과 사용자 내용을 제외합니다.
