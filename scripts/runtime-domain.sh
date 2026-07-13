#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Sentroy — runtime domain injection for prebuilt (image-mode) self-host.
#
# WHY: Next.js inlines NEXT_PUBLIC_* into the built client (and server) bundles
# at BUILD time. Hosted sentroy.com images bake the real https://sentroy.com
# URLs; a self-host operator on their own domain would otherwise ship those
# baked sentroy.com links in the browser. There is no runtime env for a value
# already compiled into a JS chunk — so we bake a SENTINEL at build and rewrite
# it here, once, at container start, from the operator's $SENTROY_ROOT_DOMAIN.
#
# SAFE FOR HOSTED PROD: hosted images bake real URLs → the sentinel is ABSENT →
# the grep guard makes this a NO-OP (byte-identical to `node server.js`). Only
# OSS/self-host images (built with NEXT_PUBLIC_*=…__RUNTIME_ROOT_DOMAIN__…) are
# rewritten. Idempotent per start (the image layer restores the sentinel each
# boot; we rewrite the writable layer each boot).
#
# Two surfaces are covered:
#   1. Client + server JS bundles under $APP_DIR/.next — the sentinel is sed'd.
#   2. SSR code that reads process.env.NEXT_PUBLIC_*_APP_URL at true runtime —
#      we export the derived values so server-rendered markup matches.
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="${SENTROY_APP_DIR:?SENTROY_APP_DIR must be set (e.g. apps/core)}"
SENTINEL="__RUNTIME_ROOT_DOMAIN__"

# Normalize: strip scheme + any trailing path, lowercase. Accept either
# SENTROY_ROOT_DOMAIN (canonical) or NEXT_PUBLIC_ROOT_DOMAIN.
ROOT="$(printf '%s' "${SENTROY_ROOT_DOMAIN:-${NEXT_PUBLIC_ROOT_DOMAIN:-}}" \
  | tr 'A-Z' 'a-z' \
  | sed -e 's#^https\{0,1\}://##' -e 's#/.*$##' -e 's#[[:space:]]##g')"

if [ -n "$ROOT" ] && grep -rlqF "$SENTINEL" "$APP_DIR/.next" 2>/dev/null; then
  echo "[runtime-domain] injecting root='$ROOT' into $APP_DIR bundle"

  # 1. Rewrite the sentinel in every built JS/JSON/HTML chunk (client + server).
  #    Temp-file + mv (not `sed -i`) for portability across BusyBox/GNU/BSD sed.
  grep -rlF "$SENTINEL" "$APP_DIR/.next" 2>/dev/null | while IFS= read -r f; do
    sed "s#$SENTINEL#$ROOT#g" "$f" > "$f.rtmp" && mv "$f.rtmp" "$f"
  done

  # 2. Export runtime-derived NEXT_PUBLIC_* for SSR/API code that reads them
  #    directly (Sentroy's fixed subdomain convention: <sub>.<root>).
  export NEXT_PUBLIC_ROOT_DOMAIN="$ROOT"
  export SENTROY_ROOT_DOMAIN="$ROOT"
  export NEXT_PUBLIC_CORE_APP_URL="https://$ROOT"
  export NEXT_PUBLIC_MAIL_APP_URL="https://mail.$ROOT"
  export NEXT_PUBLIC_STORAGE_APP_URL="https://storage.$ROOT"
  export NEXT_PUBLIC_AUTH_APP_URL="https://auth.$ROOT"
  export NEXT_PUBLIC_STATUS_APP_URL="https://status.$ROOT"
  export NEXT_PUBLIC_LINEAR_APP_URL="https://linear.$ROOT"
  export NEXT_PUBLIC_STUDIO_APP_URL="https://studio.$ROOT"
  export NEXT_PUBLIC_WHATSAPP_APP_URL="https://whatsapp.$ROOT"
  export NEXT_PUBLIC_BACKUP_APP_URL="https://backup.$ROOT"
  export NEXT_PUBLIC_VAULT_APP_URL="https://vault.$ROOT"
  export NEXT_PUBLIC_TOOLS_APP_URL="https://tools.$ROOT"
  export NEXT_PUBLIC_SENTROY_API_URL="https://api.$ROOT/api/v1"
fi

exec node "$APP_DIR/server.js"
