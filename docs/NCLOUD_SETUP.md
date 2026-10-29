# NCP 구축 — 네트워크부터 실제 사진·질문·저장까지

기준은 한국 리전, VPC 플랫폼, Ubuntu 서버입니다. 콘솔의 항목명은 바뀔 수 있으므로 현재 공식 안내와 함께 확인합니다.
이 문서의 `203.0.113.10`은 설명용 공인 IP, `10.20.*`는 설명용 사설 대역입니다. 실제 생성한 값으로 바꿉니다.
자원 생성은 과금과 권한을 수반합니다. 생성 화면의 이용 조건과 요금을 확인합니다.

## 1. 실행 장소와 성공 기준

| 장소 | 작업 | 확인할 결과 |
|---|---|---|
| NCP 웹 콘솔 | 자원·권한·ACG | 해당 자원이 운영 중이고 연결 규칙 적용 |
| PC PowerShell | SSH·파일 전송 | 서버 로그인 또는 전송 완료 |
| 서버 Bash | 설치·환경 설정·빌드 | 오류 없이 완료·정상 응답 |
| 앱·Postman | 전체 흐름 | 사진·질문·초안·저장·재조회 |

명령을 한 줄씩 실행합니다. 오류가 나면 다음 줄을 실행하기 전에 원인을 확인합니다.
`password:`의 미표시는 정상입니다. 서버 암호·DB 암호·스토리지 키·CLOVA 키를 서로 바꿔 쓰지 않습니다.

## 2. CLOVA Studio 준비

CLOVA Studio 이용을 준비하고 HCX-005와 HCX-007의 API 사용 권한을 확인합니다.
현재 사진 관찰은 HCX-005, 질문·작성·검토는 HCX-007입니다. 기존 모델의 성공만으로 새 모델 권한을 확인한 것은 아닙니다.
키는 발급처 안내대로 보관하고 서버의 CLOVA_STUDIO_API_KEY에 넣습니다. 값 앞에 Bearer를 직접 넣지 않습니다.
코드가 Authorization 헤더를 구성합니다. 플레이그라운드 설정이 앱 코드에 자동 반영되는 구조는 아닙니다.
실제 모델·추론 설정은 `src/lib/server/clova-models.js`에 있습니다.

## 3. VPC와 두 Subnet

VPC 메뉴에서 전용 네트워크와 Subnet을 만듭니다. 다음은 구성 예시입니다.

| 대상 | 예시 이름 | 예시 범위·설정 |
|---|---|---|
| VPC | memory-vpc | 10.20.0.0/16 |
| 앱 Subnet | memory-app-public | 10.20.1.0/24, Public |
| DB Subnet | memory-db-private | 10.20.2.0/24, Private |

처음에는 같은 가용 Zone을 선택해 구성을 단순하게 합니다. Public의 인터넷 경로와 Network ACL도 확인합니다.
Private DB 연결 자체를 위해 NAT Gateway가 필요한 구성은 아닙니다. 앱은 같은 VPC의 DB 내부 주소를 사용합니다.
VPC 주소를 브라우저의 공개 사이트 주소로 사용하는 것은 아닙니다.

## 4. 앱 ACG

앱 서버에 적용할 ACG를 만들고 Inbound·Outbound를 각각 추가·적용합니다.

| 방향 | 프로토콜 | 소스·목적지 | 포트 | 목적 |
|---|---|---|---|---|
| Inbound | TCP | 내 PC의 실제 공인 IP/32 | 22 | SSH |
| Inbound | TCP | 0.0.0.0/0 | 80 | HTTP·인증서 확인 |
| Inbound | TCP | 0.0.0.0/0 | 443 | HTTPS |
| Outbound | TCP | 0.0.0.0/0 | 80 | 설치 다운로드 |
| Outbound | TCP | 0.0.0.0/0 | 443 | CLOVA·Storage·다운로드 |
| Outbound | UDP와 TCP | DNS 목적지 | 53 | 이름 조회 |
| Outbound | UDP | 시간 서버 목적지 | 123 | 시각 동기화 |
| Outbound | TCP | 실제 DB 내부 대역 | 5432 | DB |

DNS·시간 서버의 목적지 범위는 실제 환경 정책에 맞춥니다. 처음 연결 확인 후 더 좁은 접근 정책을 검토할 수 있습니다.
DB의 5432는 앱 Inbound에 공개하지 않습니다. 앱 3000도 외부에 직접 열 필요가 없습니다.
SSH가 성공하는데 외부 다운로드만 시간 초과라면 Outbound가 적용됐는지 확인합니다.
[NCP ACG 공식 안내](https://guide.ncloud-docs.com/docs/server-acg-vpc)

## 5. Ubuntu 서버와 SSH

앱용 Public Subnet에 Ubuntu 서버를 만들고 앱 ACG와 공인 IP를 연결합니다.
서버의 인증키·관리자 인증 정보는 계정 안내대로 안전하게 보관합니다. 채팅·GitHub에 넣지 않습니다.
PC의 PowerShell에서 본인의 IP로 접속합니다.

```powershell
ssh root@203.0.113.10
```

로그인 후 `root@...#`가 보이면 이후 명령은 서버에서 실행됩니다.
서버에서 필요한 기본 도구와 Node.js 24를 준비합니다. Node.js 설치 방식은 조직 정책에 맞춰 선택할 수 있습니다.

```bash
apt-get update
apt-get install -y curl ca-certificates git unzip nano
```

Node가 없는 새 Ubuntu 서버라면 다음은 nvm으로 24 버전을 설치하는 방법입니다.
nvm은 같은 계정에서 사용할 Node 버전을 설치·선택하는 도구입니다. Windows PowerShell용 명령이 아닙니다.
아래는 root로 로그인한 이 서버에서 실행합니다. 이미 요구 버전이 설치되어 있다면 중복 설치할 필요가 없습니다.

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh -o /tmp/photo-memory-nvm-install.sh
bash /tmp/photo-memory-nvm-install.sh
source /root/.nvm/nvm.sh
nvm install 24
nvm alias default 24
node -v
npm -v
```

첫 줄은 설치 도구를 파일로 받고 다음 줄은 그 파일을 실행합니다. 출처와 방식은 [nvm 공식 설치 안내](https://github.com/nvm-sh/nvm#installing-and-updating)에서 확인할 수 있습니다.
`source`는 설치한 nvm을 현재 터미널에서도 사용할 수 있게 불러옵니다.
`install 24`는 Node 24와 npm을 설치하고 `alias default 24`는 이후 터미널의 기본 버전을 정합니다.
정상 결과는 `node -v`에 `v24.`로 시작하는 숫자, `npm -v`에 버전 숫자가 나오는 것입니다.
다시 SSH 접속했을 때 명령을 찾지 못하면 `source /root/.nvm/nvm.sh`를 실행한 뒤 확인합니다.
다운로드가 시간 초과라면 앱 ACG의 Outbound·DNS·인터넷 경로를 먼저 확인합니다.
저장소의 최소 요구는 Node 22.13.0 이상입니다. [Node.js 공식 다운로드](https://nodejs.org/en/download)에서도 설치 방법을 확인할 수 있습니다.
Node를 설치하는 명령과 프로젝트 라이브러리를 설치하는 `npm ci`는 별개입니다.

## 6. 비공개 사진 저장소

Object Storage 이용을 준비하고 비공개 버킷을 만듭니다. 정적 웹사이트용 전체 공개를 사용하지 않습니다.
별도 서브 계정과 적절한 저장소 권한, Access Key·Secret Key를 준비합니다.
초기 연결에서 넓은 권한을 사용했다면 운영 전에 필요한 버킷·행동만 허용하는 정책을 검토합니다.
키를 발급받는 것과 계정에 저장소 권한을 주는 것은 다른 단계입니다.

앱의 연결 정보는 NCP_ACCESS_KEY, NCP_SECRET_KEY, NCP_BUCKET입니다.
S3 호환 SDK를 쓰지만 목적지는 NCP Object Storage입니다. 공통 설정은 object-storage.js에 있습니다.
AI용 사진 접근에는 300초 서명 URL을 사용합니다. 버킷을 전체 공개로 바꾸지 않습니다.
[Object Storage 공식 안내](https://guide.ncloud-docs.com/docs/storage-storage-6-1/)

## 7. PostgreSQL과 두 겹의 접근 허용

DB용 Private Subnet에 Cloud DB for PostgreSQL을 만듭니다. 필요한 사양·고가용성·백업 옵션과 요금을 확인합니다.
DB의 실제 Private 호스트, 포트, DB 이름, 사용자, 암호를 보관합니다. 아래 이름은 예시입니다.

| 값 | 예시·설명 |
|---|---|
| DB 이름 | memorydb |
| DB 사용자 | memoryapp |
| 포트 | 5432 |
| 사용자 접근 제어 | 실제 앱 서버 사설 IP/32 |
| DB ACG Inbound | 앱 서버 ACG에서 TCP 5432 |

DB ACG를 수정할 때 소스로 앱 ACG를 지정합니다. 앱 ACG의 Inbound에 DB 포트를 여는 것과 다릅니다.
DB 사용자 접근 제어에는 서버의 공인 IP가 아니라 실제 사설 IP를 넣습니다.
앱은 최초 사용 시 테이블·인덱스를 만들므로 해당 DB 권한이 필요합니다.
[PostgreSQL 공식 안내](https://guide.ncloud-docs.com/docs/clouddbforpostgresql-overview)

## 8. 코드 설치와 비밀 설정

서버에서 새로 설치하는 예시입니다. 기존 프로젝트가 있으면 새 clone 대신 현재 작업·데이터를 먼저 확인합니다.

```bash
git clone https://github.com/tw-kang01/2026-NCP-Above-Picture.git /root/photo-memory-app
cd /root/photo-memory-app
npm ci
cp .env.example .env.local
chmod 600 .env.local
nano .env.local
```

편집기에는 다음 구조로 입력합니다. 실제 비밀은 빈칸에 본인 환경에서만 채웁니다.

```dotenv
APP_MODE=ncloud
APP_DATA_DIR=.data
APP_PUBLIC_ORIGIN=http://203.0.113.10
APP_COOKIE_SECURE=false
NCP_ACCESS_KEY=
NCP_SECRET_KEY=
NCP_BUCKET=
PGHOST=
PGPORT=5432
PGDATABASE=memorydb
PGUSER=memoryapp
PGPASSWORD=
CLOVA_STUDIO_API_KEY=
```

PGHOST에는 실제 Private 도메인을 넣습니다. 이 문서의 IP를 그대로 실행하지 않습니다.
설정 저장 후 `node --env-file=.env.local scripts/check-ncp-ai.mjs`는 실제 HCX-007 요청을 한 번 보냅니다.
키는 출력하지 않습니다. 성공하면 접근 가능성을 확인한 것이며 글쓰기 품질이나 사진 모델 권한까지 검증한 것은 아닙니다.

## 9. 실행과 접근

```bash
npm run build
npm start
```

Ready가 나오면 현재 서버 내부 3000번에서 실행됩니다. 이 직접 실행은 최종 자동 실행 설치와 다릅니다.
초기 실습용 SSH 터널은 PC의 별도 PowerShell에서 열 수 있습니다.

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:13000:127.0.0.1:3000 root@203.0.113.10
```

연결 뒤 조용히 대기하는 것은 정상입니다. PC 브라우저는 http://127.0.0.1:13000으로 접근합니다.
터널 방식을 사용할 동안 APP_PUBLIC_ORIGIN도 그 주소와 맞아야 합니다. 공개 운영용 설치는 공인 주소로 맞춥니다.
PC 없이 운영하려면 직접 실행을 종료한 뒤 [자동 실행](ALWAYS_ON_NCP.md)과 [HTTPS](HTTPS_NCP.md)를 이어서 적용합니다.

## 10. 실제 전체 검증

1. 앱이 ncloud로 실행되는지 확인합니다.
2. 테스트 사진으로 새 기록을 만듭니다.
3. 사진이 실제 저장소에 비공개로 저장되는지 확인합니다.
4. 사진 단서를 사용한 질문이 오는지 확인합니다.
5. 여러 답변을 보내고 반복 여부를 봅니다.
6. 초안과 원래 답변을 비교합니다.
7. 수정·저장·새로고침·재조회합니다.
8. 다른 브라우저에서 해당 기록에 접근할 수 없는지 봅니다.
9. 자기 테스트 기록을 지우고 사진도 정리됐는지 확인합니다.

발표 자료에는 키·쿠키·실제 사용자 내용을 넣지 않고 확인한 단계와 날짜만 남깁니다.
현 저장소의 최신 모델·HTTPS 코드는 실서버 적용 전 상태를 구분해 둡니다. [검증 기록](VERIFICATION.md)을 갱신하며 진행합니다.
