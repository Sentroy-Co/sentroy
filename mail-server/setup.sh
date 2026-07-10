#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_step() { echo -e "\n${CYAN}[$1/${TOTAL_STEPS}]${NC} ${BOLD}$2${NC}"; }
print_ok() { echo -e "  ${GREEN}✓${NC} $1"; }
print_warn() { echo -e "  ${YELLOW}!${NC} $1"; }
ask() { echo -en "  \033[0;36m→\033[0m $1: " >&2; read -r REPLY; echo "$REPLY"; }

TOTAL_STEPS=7

echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║       Sentroy Mail Server Setup       ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ─── Step 1: Domain ───
print_step 1 "Domain"

if [ -n "$1" ]; then
  DOMAIN="$1"
  print_ok "Domain: $DOMAIN"
else
  DOMAIN=$(ask "Domain adini gir (ornek: example.com)")
fi

MAIL_HOSTNAME="mail.${DOMAIN}"

# ─── Step 2: Server IP ───
print_step 2 "Server IP"
SERVER_IP=$(ask "Sunucu IP adresi (bos = 203.0.113.10)")
if [ -z "$SERVER_IP" ]; then
  SERVER_IP="203.0.113.10"
  print_ok "Varsayilan IP: ${SERVER_IP}"
fi

# ─── Step 3: API URL ───
print_step 3 "API URL"
echo -e "  ${YELLOW}API icin subdomain secenekleri:${NC}"
echo "    1) mail-api.${DOMAIN}  (onerilen)"
echo "    2) api.${DOMAIN} (default)"
echo "    Veya dogrudan domain yaz (ornek: mail.sentroy.com)"

API_INPUT=$(ask "Secim (1/2 veya domain) [2]")

# boşsa default 2 ata
API_INPUT=${API_INPUT:-2}

case $API_INPUT in
  1) API_DOMAIN="mail-api.${DOMAIN}" ;;
  2) API_DOMAIN="api.${DOMAIN}" ;;
  *) API_DOMAIN="$API_INPUT" ;;
esac

API_BASE_URL="https://${API_DOMAIN}/api/v1"
print_ok "API URL: ${API_BASE_URL}"

# ─── Step 4: UI Origin (CORS) ───
print_step 4 "UI Origin (CORS)"
echo -e "  ${YELLOW}UI servisinin domain'i (bos birak = tum originler):${NC}"
UI_ORIGIN=$(ask "UI domain (ornek: app.${DOMAIN})")

if [ -z "$UI_ORIGIN" ]; then
  API_ALLOWED_ORIGINS="*"
  print_warn "CORS: Tum originler acik (gelistirme icin)"
else
  API_ALLOWED_ORIGINS="https://${UI_ORIGIN}"
  print_ok "CORS: ${API_ALLOWED_ORIGINS}"
fi

# ─── Step 5: Generate secrets ───
print_step 5 "Sifreler ve anahtarlar olusturuluyor"

POSTGRES_USER="sentroy"
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
SMTP_USER="api@${MAIL_HOSTNAME}"
SMTP_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
IMAP_USER="inbox@${MAIL_HOSTNAME}"
IMAP_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
IMAP_MASTER_USER="sentroy"
IMAP_MASTER_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

print_ok "PostgreSQL password"
print_ok "JWT secret (64 hex)"
print_ok "SMTP credentials"
print_ok "IMAP credentials"
print_ok "IMAP master credentials (Sent folder append)"

# ─── Step 6: Write files ───
print_step 6 "Dosyalar yaziliyor"

# .env
cat > .env << ENVEOF
# ═══════════════════════════════════════
# Sentroy Mail Server — ${DOMAIN}
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ═══════════════════════════════════════

# PostgreSQL
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/maildb

# Redis
REDIS_URL=redis://redis:6379

# API
API_PORT=3000
NODE_ENV=production
LOG_LEVEL=info
JWT_SECRET=${JWT_SECRET}
API_ALLOWED_ORIGINS=${API_ALLOWED_ORIGINS}
API_BASE_URL=${API_BASE_URL}

# SMTP (Postfix)
SMTP_HOST=postfix
SMTP_PORT=25
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}

# IMAP (Dovecot)
IMAP_HOST=dovecot
IMAP_PORT=143
IMAP_USER=${IMAP_USER}
IMAP_PASS=${IMAP_PASS}

# IMAP Master — API "Sent" klasorune yazmak icin her kullaniciya master auth ile baglanir
IMAP_MASTER_USER=${IMAP_MASTER_USER}
IMAP_MASTER_PASS=${IMAP_MASTER_PASS}

# DKIM
DKIM_KEYS_PATH=/etc/rspamd/dkim

# Queue
QUEUE_CONCURRENCY=5

# Domain verification polling (ms)
DOMAIN_VERIFY_INTERVAL=300000

# IMAP connection pool
IMAP_POOL_SIZE=5

# Dovecot
DOVECOT_USERS_FILE=/etc/dovecot/users-data/users
ENVEOF
print_ok ".env"

# docker-compose.yml — tamamen yeniden olustur
cat > docker-compose.yml << COMPOSEEOF
version: '3.9'

networks:
  mailnet:
    driver: bridge

volumes:
  mail_data:
  pg_data:
  redis_data:
  dkim_keys:
  postfix_virtual:
  dovecot_users:

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - pg_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: maildb
      POSTGRES_USER: sentroy
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    command: >
      postgres
        -c shared_buffers=128MB
        -c work_mem=4MB
        -c maintenance_work_mem=64MB
        -c effective_cache_size=256MB
        -c max_connections=50
    networks:
      - mailnet
    deploy:
      resources:
        limits:
          cpus: "0.40"
          memory: 384M
        reservations:
          memory: 128M
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sentroy -d maildb"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 30s

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy noeviction
    networks:
      - mailnet
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 192M
        reservations:
          memory: 64M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  rspamd:
    build: ./rspamd
    restart: unless-stopped
    volumes:
      - dkim_keys:/etc/rspamd/dkim
    networks:
      - mailnet
    deploy:
      resources:
        limits:
          cpus: "0.30"
          memory: 384M
        reservations:
          memory: 96M
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11334/ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  postfix:
    build: ./postfix
    restart: unless-stopped
    ports:
      - "25:25"
      - "587:587"
      - "465:465"
    volumes:
      - mail_data:/var/mail
      - dkim_keys:/etc/rspamd/dkim:ro
      - postfix_virtual:/etc/postfix/virtual
    networks:
      - mailnet
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 256M
        reservations:
          memory: 64M
    depends_on:
      rspamd:
        condition: service_healthy

  dovecot:
    build: ./dovecot
    restart: unless-stopped
    ports:
      - "143:143"
      - "993:993"
    volumes:
      - mail_data:/var/mail
      - dovecot_users:/etc/dovecot/users-data
    networks:
      - mailnet
    deploy:
      resources:
        limits:
          cpus: "0.25"
          memory: 256M
        reservations:
          memory: 64M
    depends_on:
      postfix:
        condition: service_started

  api:
    build: ./api
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - dkim_keys:/etc/rspamd/dkim
      - postfix_virtual:/etc/postfix/virtual
      - dovecot_users:/etc/dovecot/users-data
    environment:
      DATABASE_URL: postgresql://sentroy:${POSTGRES_PASSWORD}@postgres:5432/maildb
      REDIS_URL: redis://redis:6379
      API_PORT: "3000"
      NODE_ENV: production
      LOG_LEVEL: info
      JWT_SECRET: ${JWT_SECRET}
      API_ALLOWED_ORIGINS: "${API_ALLOWED_ORIGINS}"
      API_BASE_URL: ${API_BASE_URL}
      SERVER_IP: "${SERVER_IP}"
      MAIL_HOSTNAME: ${MAIL_HOSTNAME}
      SMTP_HOST: postfix
      SMTP_PORT: "25"
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      IMAP_HOST: dovecot
      IMAP_PORT: "143"
      IMAP_USER: ${IMAP_USER}
      IMAP_PASS: ${IMAP_PASS}
      IMAP_MASTER_USER: ${IMAP_MASTER_USER}
      IMAP_MASTER_PASS: ${IMAP_MASTER_PASS}
      DKIM_KEYS_PATH: /etc/rspamd/dkim
      QUEUE_CONCURRENCY: "5"
      DOMAIN_VERIFY_INTERVAL: "300000"
      IMAP_POOL_SIZE: "5"
      DOVECOT_USERS_FILE: /etc/dovecot/users-data/users
      NODE_OPTIONS: "--max-old-space-size=256"
    networks:
      - mailnet
    deploy:
      resources:
        limits:
          cpus: "0.40"
          memory: 384M
        reservations:
          memory: 128M
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      postfix:
        condition: service_started
COMPOSEEOF
print_ok "docker-compose.yml"

# Postfix main.cf — hostname guncelle
sed -i.bak "s|^myhostname = .*|myhostname = ${MAIL_HOSTNAME}|" postfix/main.cf
sed -i.bak "s|^mydomain = .*|mydomain = ${DOMAIN}|" postfix/main.cf
rm -f postfix/main.cf.bak
print_ok "postfix/main.cf → myhostname=${MAIL_HOSTNAME}"

# Dovecot users dosyasi (bos sablon)
mkdir -p dovecot
cat > dovecot/users << USERSEOF
# Dovecot users — API tarafindan yonetilir
# Format: user@domain:{scheme}hash:uid:gid::home::
USERSEOF
print_ok "dovecot/users"

# ─── Step 7: Summary ───
print_step 7 "Ozet"

echo ""
echo -e "${BOLD}  Domain:${NC}         ${DOMAIN}"
echo -e "${BOLD}  Mail hostname:${NC}  ${MAIL_HOSTNAME}"
echo -e "${BOLD}  Server IP:${NC}      ${SERVER_IP}"
echo -e "${BOLD}  API URL:${NC}        ${API_BASE_URL}"
echo -e "${BOLD}  CORS:${NC}           ${API_ALLOWED_ORIGINS}"
echo ""
echo -e "${BOLD}  DNS Kayitlari (domain saglayicinda ayarla):${NC}"
echo ""
echo -e "  ${CYAN}A${NC}     ${MAIL_HOSTNAME}  →  ${SERVER_IP}"
echo -e "  ${CYAN}MX${NC}    ${DOMAIN}  →  ${MAIL_HOSTNAME} (priority 10)"
echo -e "  ${CYAN}TXT${NC}   ${DOMAIN}  →  v=spf1 ip4:${SERVER_IP} ~all"
echo -e "  ${CYAN}TXT${NC}   _dmarc.${DOMAIN}  →  v=DMARC1; p=none; rua=mailto:postmaster@${DOMAIN}"
echo -e "  ${CYAN}TXT${NC}   mail._domainkey.${DOMAIN}  →  (DKIM — API olusturacak)"
echo -e "  ${CYAN}PTR${NC}   ${SERVER_IP}  →  ${MAIL_HOSTNAME}"
echo ""
echo -e "${YELLOW}  PTR/rDNS kaydini VPS saglayicindan ayarlamayi unutma!${NC}"
echo ""

# ─── Git push ───
echo -en "${CYAN}  Git push yapilsin mi? (y/n):${NC} "
read -r PUSH_CONFIRM

# boşsa default y
PUSH_CONFIRM=${PUSH_CONFIRM:-y}

if [[ "$PUSH_CONFIRM" =~ ^[Yy]$ ]]; then
  git add -A
  git commit -m "setup: configure for ${DOMAIN}

Environment, Postfix hostname, and Dovecot users configured.
Server IP: ${SERVER_IP} | API: ${API_BASE_URL}"

  # Remote kontrol
  if git remote get-url origin &>/dev/null; then
    git push
    echo -e "\n  ${GREEN}✓ Push tamamlandi!${NC}"
  else
    echo -en "  ${CYAN}Git remote URL:${NC} "
    read -r REMOTE_URL
    git remote add origin "$REMOTE_URL"
    git push -u origin main
    echo -e "\n  ${GREEN}✓ Push tamamlandi!${NC}"
  fi
else
  echo -e "\n  ${YELLOW}Push atlanildi. Manuel olarak 'git push' yapabilirsin.${NC}"
fi

echo ""
echo -e "${GREEN}${BOLD}  Setup tamamlandi!${NC}"
echo -e "  Coolify'da docker-compose.yml'i goster ve deploy et."
echo ""
