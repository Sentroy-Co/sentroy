# syntax=docker/dockerfile:1.6
#
# apps/downloader-worker — yt-dlp/ffmpeg'i çalıştıran bağımsız Node servisi
# (Next.js yok). apps/whatsapp-gateway desenini izler: tsx runtime, full
# monorepo kopyası. Build context = monorepo root.
# Sistem binary'leri (yt-dlp, ffmpeg) runner stage'e apk ile kurulur —
# storage-api-server'daki `apk add ffmpeg` deseniyle aynı.

# ── deps ──────────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS deps
WORKDIR /repo

COPY package.json bun.lock turbo.json ./
COPY packages/ui/package.json packages/ui/
COPY packages/db/package.json packages/db/
COPY packages/auth/package.json packages/auth/
COPY packages/console/package.json packages/console/
COPY packages/app-manifest/package.json packages/app-manifest/
COPY packages/cdn-client/package.json packages/cdn-client/
COPY packages/ai-assistant/package.json packages/ai-assistant/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY apps/core/package.json apps/core/
COPY apps/mail/package.json apps/mail/
COPY apps/storage/package.json apps/storage/
COPY apps/auth2/package.json apps/auth2/
COPY apps/status/package.json apps/status/
COPY apps/status-worker/package.json apps/status-worker/
COPY apps/studio/package.json apps/studio/
COPY apps/whatsapp/package.json apps/whatsapp/
COPY apps/whatsapp-gateway/package.json apps/whatsapp-gateway/
COPY apps/downloader/package.json apps/downloader/
COPY apps/downloader-worker/package.json apps/downloader-worker/
COPY apps/linear/package.json apps/linear/
COPY apps/backup/package.json apps/backup/
COPY apps/backup-worker/package.json apps/backup-worker/
COPY apps/cdn/package.json apps/cdn/

RUN bun install --frozen-lockfile

# ── builder ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat

COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# tsx runtime ile çalışır; tsc build skip (whatsapp-gateway ile aynı gerekçe).
WORKDIR /repo

# ── runner ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# ffmpeg: alpine repo. yt-dlp + gallery-dl: pip ile GÜNCEL (alpine paketi eski
# kalıyor; bot-koruması fix'leri günlük geliyor → güncel şart). gallery-dl
# Instagram foto/carousel/profil-resmi için; zip carousel'i tek dosyada paketler.
RUN apk add --no-cache libc6-compat ffmpeg python3 py3-pip zip \
  && pip install --no-cache-dir --break-system-packages -U yt-dlp gallery-dl

# ─────────────────────────────────────────────────────────────────────────────
# OFFICE CONVERTER (PASİF — sunucu CPU upgrade'inde aktif et)
# tools.sentroy.com Word/Excel/PPT↔PDF için LibreOffice. ⚠ image ~500MB+ büyür,
# dönüşüm CPU/RAM ağır → şimdilik KAPALI tutuluyor. AKTİF ETMEK için:
#   1) Aşağıdaki RUN + ENV HOME satırlarını aç (yorumdan çıkar)
#   2) downloader env: OFFICE_CONVERT_ENABLED=true
#   3) registry.ts: word/pdf/excel/powerpoint-to-pdf → status "live"
#   4) deploy --apps downloader,downloader-worker
# RUN apk add --no-cache \
#     libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-common \
#     ttf-liberation ttf-dejavu font-noto
# ENV HOME=/tmp
# ─────────────────────────────────────────────────────────────────────────────

ENV NODE_ENV=production
ENV PORT=4300
ENV DOWNLOAD_DIR=/tmp/dl

RUN addgroup -S nodejs -g 1001 && adduser -S worker -u 1001 -G nodejs \
  && mkdir -p /tmp/dl && chown worker:nodejs /tmp/dl

COPY --from=builder --chown=worker:nodejs /repo/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /repo/apps/downloader-worker ./apps/downloader-worker
COPY --from=builder --chown=worker:nodejs /repo/package.json ./package.json
COPY --from=builder --chown=worker:nodejs /repo/tsconfig.json ./tsconfig.json

USER worker
EXPOSE 4300

WORKDIR /app/apps/downloader-worker
CMD ["node", "--import", "tsx", "src/main.ts"]
