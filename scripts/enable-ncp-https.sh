#!/usr/bin/env bash
# HTTP로 동작하는 NCP 앱에 공인 IP용 HTTPS 인증서와 자동 갱신 검사를 연결합니다.
# Ubuntu 서버에서 실행하며 예제의 문서용 IP는 실제 공인 IP로 교체합니다.
set -Eeuo pipefail
rollback_required=false
had_override=false
site=/etc/nginx/sites-available/photo-memory
override=/etc/systemd/system/photo-memory.service.d/90-https.conf
webroot=/var/www/photo-memory-acme
cert_name=photo-memory-ip
cert_dir="/etc/letsencrypt/live/$cert_name"

# 설정 도중 실패하면 백업한 웹·앱 설정을 복원하고 같은 실패 코드로 종료합니다.
# 발급한 인증서는 삭제하지 않습니다. 인수는 종료 코드와 실패한 줄 번호입니다.
on_failure() {
  local status="$1" line="$2"
  trap - ERR INT TERM
  set +e
  if [[ "$rollback_required" == true ]]; then
    cp -p "$backup_dir/photo-memory" "$site"
    if [[ "$had_override" == true ]]; then
      cp -p "$backup_dir/90-https.conf" "$override"
    else
      rm -f -- "$override"
    fi
    systemctl daemon-reload
    systemctl restart photo-memory
    if nginx -t; then systemctl reload nginx; fi
    echo "Restored the previous web/app settings. Issued certificates were kept."
  fi
  printf '\nHTTPS setup stopped at line %s. Inspect the error above.\n' "$line" >&2
  exit "$status"
}
trap 'on_failure "$?" "$LINENO"' ERR
trap 'on_failure 130 "$LINENO"' INT TERM

if [[ "$EUID" -ne 0 ]]; then echo "Run on the NCP Ubuntu server as root." >&2; exit 1; fi
server_ip="${1:-}"
if [[ ! "$server_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "Usage: bash scripts/enable-ncp-https.sh 203.0.113.10" >&2
  exit 1
fi
IFS='.' read -r -a octets <<< "$server_ip"
for octet in "${octets[@]}"; do
  if (( 10#$octet > 255 )); then echo "Invalid IPv4 address." >&2; exit 1; fi
done
if [[ ! -f "$site" ]] || ! systemctl is-active --quiet photo-memory || ! systemctl is-active --quiet nginx; then
  echo "First complete install-ncp-service.sh and verify HTTP works." >&2
  exit 1
fi
nginx -t
if grep -Eq 'listen[[:space:]]+443' "$site" && ! grep -q '^# photo-memory-managed-https$' "$site"; then
  echo "Existing custom HTTPS configuration found. Review it before replacing it." >&2
  exit 1
fi

echo "[1/6] Installing the current official Certbot snap..."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y snapd ca-certificates curl openssl
systemctl enable --now snapd.socket
snap wait system seed.loaded
if ! snap list certbot >/dev/null 2>&1; then snap install --classic certbot; fi
certbot_version="$(/snap/bin/certbot --version | awk '{print $2}')"
if ! dpkg --compare-versions "$certbot_version" ge 5.4.0; then
  snap refresh certbot
  certbot_version="$(/snap/bin/certbot --version | awk '{print $2}')"
  dpkg --compare-versions "$certbot_version" ge 5.4.0
fi
echo "Certbot $certbot_version"

echo "[2/6] Preparing the HTTP certificate-validation route..."
# 설정을 바꾸기 전에 서버 내부에 백업한 뒤 HTTP 인증 확인 경로를 준비합니다.
backup_dir="/var/backups/photo-memory/https-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$backup_dir"
cp -p "$site" "$backup_dir/photo-memory"
if [[ -f "$override" ]]; then
  had_override=true
  cp -p "$override" "$backup_dir/90-https.conf"
fi
rollback_required=true
install -d -m 755 "$webroot/.well-known/acme-challenge"
if ! grep -q '^# photo-memory-managed-https$' "$site"; then
  cat > "$site" <<EOF
server {
    listen 80;
    server_name $server_ip;
    client_max_body_size 16m;
    server_tokens off;
    location ^~ /.well-known/acme-challenge/ {
        root $webroot;
        default_type text/plain;
        try_files \$uri =404;
    }
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
fi
nginx -t
systemctl reload nginx
probe="photo-memory-$(date +%s)-$$"
printf '%s' "$probe" > "$webroot/.well-known/acme-challenge/photo-memory-ready"
challenge_ready=false
for attempt in {1..20}; do
  if [[ "$(curl -fsS --max-time 3 -H "Host: $server_ip" http://127.0.0.1/.well-known/acme-challenge/photo-memory-ready 2>/dev/null)" == "$probe" ]]; then
    challenge_ready=true
    break
  fi
  sleep 1
done
if [[ "$challenge_ready" != true ]]; then echo "HTTP challenge route failed." >&2; false; fi

echo "[3/6] Requesting a trusted production certificate for $server_ip..."
# 이메일을 코드에 넣지 않고 비대화형으로 인증서를 요청합니다.
# --agree-tos는 Let's Encrypt 약관 동의입니다. 먼저 HTTPS_NCP.md를 읽습니다.
# shortlived IP 인증서는 수명이 짧으므로 아래의 자동 갱신 검사도 필요합니다.
/snap/bin/certbot certonly --non-interactive --agree-tos \
  --server https://acme-v02.api.letsencrypt.org/directory \
  --preferred-profile shortlived \
  --webroot --webroot-path "$webroot" \
  --ip-address "$server_ip" --cert-name "$cert_name" --keep-until-expiring
openssl x509 -in "$cert_dir/fullchain.pem" -noout -checkip "$server_ip"
openssl x509 -in "$cert_dir/fullchain.pem" -noout -checkend 0

echo "[4/6] Enabling HTTPS, redirects, and secure session cookies..."
cat > "$site" <<EOF
# photo-memory-managed-https
server {
    listen 80;
    server_name $server_ip;
    location ^~ /.well-known/acme-challenge/ {
        root $webroot;
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 308 https://$server_ip\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $server_ip;
    ssl_certificate $cert_dir/fullchain.pem;
    ssl_certificate_key $cert_dir/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:PhotoMemoryTLS:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
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
nginx -t
install -d -m 755 /etc/systemd/system/photo-memory.service.d
cat > "$override" <<EOF
[Service]
Environment=APP_PUBLIC_ORIGIN=https://$server_ip
Environment=APP_COOKIE_SECURE=true
EOF
systemctl daemon-reload
systemctl restart photo-memory
systemctl reload nginx
if command -v ufw >/dev/null 2>&1 && LC_ALL=C ufw status | grep -q '^Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi
https_ready=false
for attempt in {1..30}; do
  if response="$(curl -fsS --max-time 3 --connect-to "$server_ip:443:127.0.0.1:443" "https://$server_ip/api/app" 2>/dev/null)" &&
    printf '%s' "$response" | /opt/photo-memory-node/bin/node -e '
      let text = "";
      process.stdin.on("data", (chunk) => { text += chunk; });
      process.stdin.on("end", () => {
        try {
          const result = JSON.parse(text);
          process.exit(result.ok === true && result.data?.mode === "ncloud" && result.data?.configured === true ? 0 : 1);
        } catch { process.exit(1); }
      });
    '; then https_ready=true; break; fi
  sleep 1
done
if [[ "$https_ready" != true ]]; then echo "Trusted HTTPS app check failed." >&2; false; fi
redirect="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -H "Host: $server_ip" http://127.0.0.1/)"
[[ "$redirect" == 308 ]]
# 인증서 검증을 포함한 HTTPS 접속이 성공했습니다.
# 이후 갱신 모의 검사에 실패해도 이미 동작하는 HTTPS 설정은 유지합니다.
rollback_required=false

echo "[5/6] Scheduling certificate renewal checks every six hours..."
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
# 인증서를 실제 갱신한 뒤에만 Nginx 설정 검사와 재적용을 수행하는 후크입니다.
cat > /etc/letsencrypt/renewal-hooks/deploy/photo-memory-nginx <<'HOOK'
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/photo-memory-nginx
cat > /etc/systemd/system/photo-memory-cert-renew.service <<EOF
[Unit]
Description=Renew the photo-memory IP certificate when due
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
ExecStart=/snap/bin/certbot renew --cert-name $cert_name --quiet
EOF
# 6시간마다 갱신 필요 여부를 검사합니다. 매번 새로 발급한다는 뜻은 아닙니다.
# Persistent는 서버가 꺼져 놓친 검사도 부팅 후 수행하게 합니다.
cat > /etc/systemd/system/photo-memory-cert-renew.timer <<'TIMER'
[Unit]
Description=Check the photo-memory IP certificate every six hours
[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
RandomizedDelaySec=1800
Persistent=true
[Install]
WantedBy=timers.target
TIMER
systemctl daemon-reload
systemctl enable --now photo-memory-cert-renew.timer

echo "[6/6] Testing renewal without replacing the production certificate..."
/snap/bin/certbot renew --cert-name "$cert_name" --dry-run --run-deploy-hooks
systemctl is-active photo-memory nginx photo-memory-cert-renew.timer
systemctl is-enabled photo-memory nginx photo-memory-cert-renew.timer
openssl x509 -in "$cert_dir/fullchain.pem" -noout -issuer -dates
printf '\nHTTPS READY: https://%s\n' "$server_ip"
echo "In the NCP app server ACG keep inbound TCP 80 and 443 open from 0.0.0.0/0."
echo "Local HTTPS was checked with full certificate verification. Test the public URL from a phone next."
