#!/bin/bash
set -e

VIRTUAL_DIR="/etc/postfix/virtual"

# İlk başlatmada boş dosyaları oluştur (volume boş olabilir).
# `aliases` catch-all routing icin (services/postfix.ts updateVirtualAliases).
mkdir -p "$VIRTUAL_DIR"
touch "$VIRTUAL_DIR/domains" "$VIRTUAL_DIR/mailboxes" "$VIRTUAL_DIR/aliases"

# Arka planda dosya değişikliklerini izle ve postfix reload yap
(
  LAST_HASH=""
  while true; do
    sleep 10
    CURRENT_HASH=$(cat "$VIRTUAL_DIR/domains" "$VIRTUAL_DIR/mailboxes" "$VIRTUAL_DIR/aliases" 2>/dev/null | md5sum)
    if [ "$CURRENT_HASH" != "$LAST_HASH" ] && [ -n "$LAST_HASH" ]; then
      postfix reload 2>/dev/null || true
    fi
    LAST_HASH="$CURRENT_HASH"
  done
) &

# Hostname/domain env-driven override (open-source portability). Env set
# edilmezse main.cf'teki committed default'lar (mail.sentroy.com/sentroy.com)
# kalır → mevcut prod byte-aynı. postconf postfix image'inde mevcut.
if [ -n "$MAIL_HOSTNAME" ]; then postconf -e "myhostname=$MAIL_HOSTNAME"; fi
if [ -n "$MAIL_DOMAIN" ]; then postconf -e "mydomain=$MAIL_DOMAIN"; fi

# Postfix başlat
exec postfix start-fg
