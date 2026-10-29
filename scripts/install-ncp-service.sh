#!/usr/bin/env bash
# NCP Ubuntu 서버에서 실행하는 설치 도구이며 PC PowerShell에서는 실행하지 않습니다.
# 서버의 비밀 설정과 빌드 결과를 전용 계정으로 복사하고 자동 시작을 등록합니다.
# 예제의 문서용 IP는 NCP 콘솔에서 확인한 실제 공인 IP로 교체합니다.
set -Eeuo pipefail
trap 'printf "\nSetup stopped at line %s. Fix the error above and run again.\n" "$LINENO" >&2' ERR

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the NCP server." >&2
  exit 1
fi
server_ip="${1:-}"
if [[ ! "$server_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "Usage: bash scripts/install-ncp-service.sh 203.0.113.10" >&2
  exit 1
fi
IFS='.' read -r -a octets <<< "$server_ip"
for octet in "${octets[@]}"; do
  if (( 10#$octet > 255 )); then echo "Invalid IPv4 address." >&2; exit 1; fi
done

# 소스와 실제 실행 폴더를 나누어 서비스가 root 홈 폴더를 참조하지 않게 합니다.
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
app_dir=/srv/photo-memory-app
runtime_dir=/opt/photo-memory-node
service_name=photo-memory.service
public_origin="http://$server_ip"
cookie_secure=false
# 재배포할 때 기존 HTTPS 주소와 관리 표식을 확인하고 인증서 설정을 유지합니다.
https_configured=false
if [[ -f /etc/systemd/system/photo-memory.service.d/90-https.conf ]]; then
  if ! grep -Fxq "Environment=APP_PUBLIC_ORIGIN=https://$server_ip" /etc/systemd/system/photo-memory.service.d/90-https.conf ||
     ! grep -q '^# photo-memory-managed-https$' /etc/nginx/sites-available/photo-memory; then
    echo "Existing HTTPS settings do not match this IP. Inspect them before redeploying." >&2
    exit 1
  fi
  https_configured=true
  public_origin="https://$server_ip"
  cookie_secure=true
fi
cd "$source_dir"
if [[ "$source_dir" == "$app_dir" ]]; then
  echo "Run from /root/photo-memory-app (the build source), not /srv/photo-memory-app." >&2
  exit 1
fi
# 비밀 설정·빌드 결과·실행 도구가 갖춰진 경우에만 실제 서비스를 교체합니다.
for required in .env.local .next/BUILD_ID node_modules/next/dist/bin/next package.json; do
  if [[ ! -f "$required" ]]; then echo "Missing $required. Run npm ci and npm run build first." >&2; exit 1; fi
done
if ! command -v node >/dev/null 2>&1 && [[ -f /root/.nvm/nvm.sh ]]; then
  source /root/.nvm/nvm.sh
fi
node_binary="$(readlink -f "$(command -v node)")"
"$node_binary" --env-file=.env.local --input-type=module <<'NODE'
import { appConfiguration } from './src/lib/server/app/config.js';
const config = appConfiguration();
if (config.mode !== 'ncloud' || !config.configured) {
  console.error('NCP configuration is incomplete. Check .env.local locally on this server.');
  process.exit(1);
}
NODE
if ! systemctl is-active --quiet "$service_name" && [[ -n "$(ss -H -ltn 'sport = :3000')" ]]; then
  echo "Port 3000 is in use. Press Ctrl+C in the terminal running npm start, then run this script again." >&2
  exit 1
fi

echo "[1/5] Installing Nginx and deployment tools..."
# 일부 서버는 IPv6를 지원하지 않아 기본 [::]:80 설정으로 Nginx 설치가 중단됩니다.
# 원래 설정을 백업한 뒤 이 줄만 비활성화하고 IPv4의 80번 접속은 유지합니다.
disable_default_nginx_ipv6() {
  local default_site=/etc/nginx/sites-available/default
  if [[ -f "$default_site" ]] && grep -Eq '^[[:space:]]*listen[[:space:]]+\[::\]:80([[:space:];])' "$default_site"; then
    install -d -m 700 /var/backups/photo-memory
    cp -p "$default_site" "/var/backups/photo-memory/nginx-default-$(date +%Y%m%d-%H%M%S).conf"
    sed -Ei '/^[[:space:]]*listen[[:space:]]+\[::\]:80([[:space:];])/s/^/# photo-memory IPv4 deployment: /' "$default_site"
    echo "Disabled the default IPv6 HTTP listener; IPv4 HTTP stays enabled."
  fi
}
# 앞서 중단된 패키지 설치를 재시도하기 전에 기본 설정부터 고칩니다.
disable_default_nginx_ipv6
apt-get update
# 기본 설정 파일을 먼저 설치·수정한 다음 Nginx 실행 패키지를 설치합니다.
DEBIAN_FRONTEND=noninteractive apt-get install -y nginx-common
disable_default_nginx_ipv6
DEBIAN_FRONTEND=noninteractive apt-get install -y nginx rsync curl
if ! id photo-memory >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$app_dir" --shell /usr/sbin/nologin photo-memory
fi
if [[ "$(id -u photo-memory)" == 0 ]]; then echo "Invalid service user." >&2; exit 1; fi
backup_dir="/var/backups/photo-memory/$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$backup_dir"
for config in /etc/systemd/system/photo-memory.service /etc/nginx/sites-available/photo-memory; do
  if [[ -f "$config" ]]; then cp -p "$config" "$backup_dir/$(basename "$config")"; fi
done

echo "[2/5] Copying the built app and a dedicated Node runtime..."
systemctl stop "$service_name" 2>/dev/null || true
install -d -m 755 "$app_dir" "$runtime_dir/bin"
# 새 실행 파일을 다른 이름으로 복사한 뒤 이름을 바꿔 교체합니다.
install -m 755 "$node_binary" "$runtime_dir/bin/node.new"
mv -f "$runtime_dir/bin/node.new" "$runtime_dir/bin/node"
for directory in src public node_modules .next; do
  # 의존성 링크도 실제 내용으로 복사하여 /root에 접근할 필요를 없앱니다.
  rsync -aL "$source_dir/$directory" "$app_dir/"
done
for file in package.json package-lock.json next.config.mjs jsconfig.json; do
  install -m 644 "$source_dir/$file" "$app_dir/$file"
done
# 비밀 설정은 서버 안에서만 복사하며 ZIP에는 포함하지 않습니다. 서비스 계정만 읽습니다.
install -o photo-memory -g photo-memory -m 600 .env.local "$app_dir/.env.local"
install -d -o photo-memory -g photo-memory -m 700 "$app_dir/.data"
chown -R photo-memory:photo-memory "$app_dir"

echo "[3/5] Enabling the app at boot with automatic restart..."
# systemd가 서버 부팅 때 앱을 시작하고 앱이 중단되면 다시 실행하도록 등록합니다.
# 3000번 앱 포트는 서버 내부에만 열고 외부 접속은 Nginx가 전달합니다.
cat > /etc/systemd/system/photo-memory.service <<EOF
[Unit]
Description=Photo Memory NCP application
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=photo-memory
Group=photo-memory
WorkingDirectory=$app_dir
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
Environment=APP_MODE=ncloud
Environment=APP_PUBLIC_ORIGIN=$public_origin
Environment=APP_COOKIE_SECURE=$cookie_secure
Environment=PATH=$runtime_dir/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$runtime_dir/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "$service_name"
ready=false
for attempt in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "App did not start. Inspect: journalctl -u photo-memory -n 60 --no-pager" >&2
  exit 1
fi

echo "[4/5] Connecting public HTTP traffic to the app..."
if [[ "$https_configured" == false ]]; then
cat > /etc/nginx/sites-available/photo-memory <<EOF
server {
    listen 80;
    server_name $server_ip;
    client_max_body_size 16m;
    server_tokens off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 240s;
        proxy_send_timeout 120s;
        proxy_buffering off;
    }
}
EOF
else
  echo "Keeping the existing HTTPS certificate, challenge route, and redirect."
  sed -Ei 's/proxy_read_timeout[[:space:]]+[0-9]+s;/proxy_read_timeout 240s;/' /etc/nginx/sites-available/photo-memory
fi
ln -sfn /etc/nginx/sites-available/photo-memory /etc/nginx/sites-enabled/photo-memory
nginx -t
systemctl enable --now nginx
systemctl reload nginx
if command -v ufw >/dev/null 2>&1 && LC_ALL=C ufw status | grep -q '^Status: active'; then
  ufw allow 80/tcp
  if [[ "$https_configured" == true ]]; then ufw allow 443/tcp; fi
fi

echo "[5/5] Checking local service and proxy..."
# 설정 전환 직후에는 이전 Nginx 작업 프로세스가 잠깐 응답할 수 있습니다.
# 단순 HTTP 200뿐 아니라 이 앱의 정상 ncloud 응답인지 반복 확인합니다.
proxy_ready=false
proxy_url=http://127.0.0.1/api/app
proxy_options=(-H "Host: $server_ip")
if [[ "$https_configured" == true ]]; then
  proxy_url="$public_origin/api/app"
  proxy_options=(--connect-to "$server_ip:443:127.0.0.1:443")
fi
for attempt in {1..20}; do
  if proxy_response="$(curl -fsS --max-time 3 "${proxy_options[@]}" "$proxy_url" 2>/dev/null)" &&
    printf '%s' "$proxy_response" | "$runtime_dir/bin/node" -e '
      let body = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { body += chunk; });
      process.stdin.on("end", () => {
        try {
          const result = JSON.parse(body);
          process.exit(result.ok === true && result.data?.mode === "ncloud" && result.data?.configured === true ? 0 : 1);
        } catch { process.exit(1); }
      });
    '; then
    proxy_ready=true
    break
  fi
  sleep 1
done
if [[ "$proxy_ready" != true ]]; then
  echo "Proxy check did not pass. Inspect these separately:" >&2
  echo "curl -i --max-time 10 http://127.0.0.1:3000/api/app" >&2
  echo "curl -i --max-time 10 -H 'Host: $server_ip' http://127.0.0.1/api/app" >&2
  echo "systemctl status photo-memory nginx --no-pager" >&2
  exit 1
fi
printf '%s' "$proxy_response"
printf '\n'
systemctl is-active "$service_name" nginx
systemctl is-enabled "$service_name" nginx
printf '\nREADY: %s\n' "$public_origin"
echo "In the NCP app server ACG, allow inbound TCP 80 from 0.0.0.0/0."
if [[ "$https_configured" == true ]]; then echo "Keep inbound TCP 443 open too."; fi
echo "Then test on a phone using mobile data. This local check does not verify the NCP ACG."
echo "After that succeeds, SSH windows and the PC may be closed. Keep the NCP server running."
