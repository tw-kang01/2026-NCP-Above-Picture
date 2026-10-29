# PC를 꺼도 접속되는 NCP 자동 실행

Ubuntu NCP 서버에 앱을 서비스로 설치하면 PC의 개발 서버를 꺼도 서버가 앱을 실행합니다.
최신 모델·HTTPS 변경은 아직 실서버에서 검증하지 않았으므로 적용 후 직접 동작을 확인해야 합니다.
모든 `203.0.113.10`은 본인의 공인 IP로 바꿉니다.

## 1. 실행 구조

```text
사용자 브라우저 → Nginx 80/443 → 서버 내부 Next.js 3000
                                      ↓
                           DB·Object Storage·CLOVA
```

systemd는 서버 부팅 시 앱을 시작하고 앱이 종료되면 다시 실행합니다. Nginx가 공개 요청을 내부 앱에 전달하므로 웹 접속에 내 PC의 SSH 터널이 필요하지 않습니다.
NCP 서버는 운영 중으로 유지해야 합니다.

## 2. 코드 준비

새 설치는 [NCP 설정](NCLOUD_SETUP.md)을 완료합니다. 업데이트라면 현재 기록과 비밀 설정을 보존한 채 코드를 교체합니다.
Git으로 설치했다면 서버 작업 폴더의 변경 상태를 확인한 뒤 최신 커밋을 반영합니다. 개인 설정을 무조건 덮어쓰지 않습니다.
ZIP 방식은 PC의 공개 저장소에서 다음처럼 준비합니다.

```powershell
git add .
& .\scripts\package-update.ps1
```

새 파일을 ZIP에 포함하려면 먼저 Git 추적 목록에 추가해야 합니다. 스크립트는 현재 공개본을 검사한 뒤 프로젝트 상위 폴더에 새 ZIP을 만듭니다.
출력 폴더를 바꾸려면 `-OutputDirectory`를 지정합니다. 생성된 파일의 경로를 확인하고 PC에서 전송합니다.

```powershell
scp "$env:USERPROFILE\Documents\photo-memory-update.zip" "root@203.0.113.10:/root/"
```

위 로컬 경로는 예시이므로 실제 생성된 경로로 바꿉니다. password가 나오면 서버 인증을 입력합니다.

## 3. 서버에서 업데이트·빌드

압축은 `photo-memory-app/`을 최상위 폴더로 포함합니다. 서버 Bash에서 적용합니다.

```bash
unzip -o /root/photo-memory-update.zip -d /root
cd /root/photo-memory-app
npm ci
npm run build
```

처음 설치할 때는 npm ci가 필요합니다. 의존성을 바꾸지 않은 업데이트에서는 생략할 수 있습니다.
빌드에 오류가 나면 서비스 설치로 넘어가지 않습니다. 공개 ZIP에는 `.env.local`이 없으므로 서버에 기존 설정을 준비해야 합니다.
직접 켠 npm start가 3000을 점유했다면 그 터미널에서 Ctrl+C로 종료합니다.

## 4. 서비스 설치

```bash
bash scripts/install-ncp-service.sh 203.0.113.10
```

스크립트는 Nginx·rsync 등을 준비하고 전용 사용자를 만듭니다. 앱은 `/srv/photo-memory-app`에, 런타임은 `/opt/photo-memory-node`에 배치합니다.
서비스 이름은 photo-memory이며 관리자 홈에 있는 빌드 소스와 별도 경로에서 실행합니다.
비밀 설정은 읽기 권한을 제한해 서비스 경로에 복사하고 DB·Object Storage는 기존 자원을 그대로 사용합니다.
기존 프로젝트 방식의 HTTPS 설정이 같은 IP에 있으면 이를 유지하고 프록시 대기 시간을 맞춥니다.
다른 사용자 정의 HTTPS가 있거나 IP가 다르면 내용을 먼저 확인해야 합니다.

## 5. 내부·외부를 나눠 점검

```bash
systemctl is-active photo-memory nginx
systemctl is-enabled photo-memory nginx
curl -sS http://127.0.0.1:3000/api/app
```

active 두 개, enabled 두 개, 앱의 ok:true가 기본 확인입니다. configured는 설정 존재 여부만 뜻합니다.
HTTP 구성이라면 다음으로 Nginx 경로를 봅니다.

```bash
curl -sS -H 'Host: 203.0.113.10' http://127.0.0.1/api/app
```

HTTPS를 구성한 뒤에는 308 이동 응답이 정상일 수 있으므로 HTTPS 주소에서 인증서 검증을 이어갑니다.
앱 서버에 연결된 ACG의 Inbound에서 TCP 80·443을 확인합니다.
휴대폰의 Wi-Fi를 끄고 실제 주소로 접속합니다. PC의 터미널을 닫은 뒤에도 다시 열리는지 확인합니다.
설치의 로컬 점검은 외부 ACG나 모바일 접속을 대신하지 않습니다.

## 6. 재시작과 로그

```bash
systemctl restart photo-memory
systemctl status photo-memory nginx --no-pager
journalctl -u photo-memory -n 60 --no-pager
```

로그는 오류 코드·requestId 중심으로 확인합니다. 실제 답변·키·쿠키가 있는 로그를 그대로 공유하지 않습니다.
IPv6 미지원 Ubuntu에서 `[::]:80` 기본 수신 때문에 Nginx 설치가 실패했던 사례가 있어 설치 스크립트에 IPv4 대응을 넣었습니다.
Nginx를 reload하는 동안 잠깐 예전 응답이 보일 수 있어 설치 검사는 새 앱의 응답을 기다립니다.
HTTP가 확인되면 [HTTPS 발급·갱신](HTTPS_NCP.md)을 이어서 진행합니다.
