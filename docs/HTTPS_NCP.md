# 도메인 없이 공인 IP로 HTTPS 설정하기

Ubuntu·Nginx·systemd 설치를 마친 뒤 이 절차를 적용합니다. IP 예시 `203.0.113.10`은 본인이 인증서를 발급할 실제 공개 IP로 바꿉니다.
최신 스크립트의 실서버 실행과 인증서 발급은 아직 검증하지 않았습니다.

## 1. HTTPS가 필요한 이유

HTTPS는 인증서로 서버를 확인하고 TLS로 통신을 암호화합니다. 80번 HTTP가 열려 있어도 443 수신과 인증서가 없으면 HTTPS 접속은 실패합니다.
설정을 마쳤는지 확인할 때는 브라우저가 인증서 경고 없이 접속하는지 봅니다.

현재 스크립트는 Let’s Encrypt의 짧은 유효기간 IP 인증서와 Certbot을 사용합니다.
IP 인증서는 약 6일 유효하므로 갱신 자동화와 갱신 시험이 중요합니다.
[Let’s Encrypt 공식 안내](https://letsencrypt.org/2026/03/11/shorter-certs-certbot/)

## 2. 먼저 확인할 것

- HTTP 자동 실행이 동작하고 photo-memory·nginx가 active여야 합니다.
- 앱 서버에 고정해서 사용할 실제 공인 IP가 있어야 합니다.
- ACG Inbound TCP 80·443이 인터넷에서 접근 가능해야 합니다.
- Outbound HTTPS·DNS 등 인증서 발급과 패키지 설치 경로가 필요합니다.
- 서버의 시각과 DNS가 정상이어야 합니다.
- 이 프로젝트가 만든 Nginx 설정인지 확인합니다. 사용자 정의 HTTPS를 무조건 덮어쓰지 않습니다.

80번은 일반 페이지 이동뿐 아니라 인증서 소유 확인 경로에도 사용합니다. HTTPS가 됐다고 닫으면 갱신이 실패할 수 있습니다.

## 3. 서버에서 실행

```bash
cd /root/photo-memory-app
bash scripts/enable-ncp-https.sh 203.0.113.10
```

스크립트는 root 권한으로 시스템 설정을 바꿉니다. Certbot snap과 지원 버전을 준비한 뒤 운영 Let’s Encrypt 서버에 인증서를 요청합니다.
입력을 기다리지 않고 실행하도록 이용 약관 동의 옵션을 넣었으므로 사용 전에 약관과 해당 계정의 정책을 확인합니다. 문서와 저장소에는 실제 이메일이나 개인 연락처를 넣지 않습니다.

## 4. 스크립트의 처리 순서

1. 기존 Nginx와 서비스 설정을 제한된 서버 백업 경로에 보관합니다.
2. `/.well-known/acme-challenge/` HTTP 확인 경로를 준비합니다.
3. 공개 IP의 shortlived 인증서를 요청하고 IP·유효기간을 검사합니다.
4. 443 TLS 수신과 HTTP→HTTPS 308 이동을 구성합니다.
5. 서비스의 APP_PUBLIC_ORIGIN과 APP_COOKIE_SECURE를 HTTPS에 맞춥니다.
6. 인증서를 검증하며 앱 응답을 확인합니다.
7. 갱신 서비스·타이머·Nginx 갱신 후크를 만듭니다.
8. 갱신 dry-run을 수행합니다.

인증서 경로는 `/etc/letsencrypt/live/photo-memory-ip/`입니다.
photo-memory-cert-renew.timer는 00·06·12·18시에 갱신이 필요한지 점검합니다. 각 점검에는 임의 지연이 더해질 수 있으며 인증서는 필요할 때만 새로 발급합니다.

## 5. 완료 확인

```bash
systemctl is-active photo-memory nginx photo-memory-cert-renew.timer
systemctl is-enabled photo-memory nginx photo-memory-cert-renew.timer
systemctl list-timers photo-memory-cert-renew.timer
openssl x509 -in /etc/letsencrypt/live/photo-memory-ip/fullchain.pem -noout -issuer -dates
```

휴대폰 데이터망에서 실제 HTTPS 주소가 경고 없이 열리는지 확인하고 같은 주소의 HTTP가 HTTPS로 이동하는지도 봅니다. 이 외부 접속으로 ACG까지 확인해야 합니다.
갱신 시험은 다음 명령으로 진행합니다.

```bash
/snap/bin/certbot renew --cert-name photo-memory-ip --dry-run --run-deploy-hooks
```

## 6. 쿠키와 실패 처리

같은 호스트의 기존 HTTP 세션은 HTTPS 전환 때 같은 식별값을 유지하고 Secure 속성을 붙입니다.
다른 도메인이나 브라우저의 쿠키는 자동으로 옮기지 않으므로 기존 기록을 찾으려면 호스트와 쿠키를 확인합니다.
적용 중 웹·앱 설정에 실패하면 가능한 범위에서 이전 설정으로 복구하고 발급된 인증서는 보관합니다. HTTPS가 정상인 뒤 갱신 시험만 실패했을 때는 동작 중인 HTTPS를 유지합니다.
오류가 난 단계를 확인한 뒤 원인을 고칩니다. 인증서를 반복 발급하는 것으로 해결하려 하지 않습니다.
원인별 확인은 ACG·HTTP 인증 경로·Certbot 오류 코드·시각·DNS·Nginx 구문 순서로 나눕니다.
