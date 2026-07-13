# syntax=docker/dockerfile:1.6
#
# apps/backup — MongoDB Backuper dashboard (connections + backups UI).
# Backup/restore işleri apps/backup-worker'da (mongodump/mongorestore).
# Build context = monorepo root.

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

FROM node:20-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat

COPY --from=deps /repo/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ARG MONGODB_URI=mongodb://placeholder:27017/build
ARG BETTER_AUTH_SECRET=build-placeholder-secret
ENV MONGODB_URI=$MONGODB_URI
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET

ARG NEXT_PUBLIC_CORE_APP_URL
ARG NEXT_PUBLIC_BACKUP_APP_URL
ENV NEXT_PUBLIC_CORE_APP_URL=$NEXT_PUBLIC_CORE_APP_URL
ENV NEXT_PUBLIC_BACKUP_APP_URL=$NEXT_PUBLIC_BACKUP_APP_URL

ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /repo/apps/backup
RUN npx next build
WORKDIR /repo

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3010

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/backup/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/backup/.next/static ./apps/backup/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/backup/public ./apps/backup/public

# Runtime domain injection (self-host/OSS image-mode). Hosted images bake
# real URLs → sentinel absent → no-op. See scripts/runtime-domain.sh.
COPY scripts/runtime-domain.sh /app/runtime-domain.sh
USER nextjs
EXPOSE 3010

ENV SENTROY_APP_DIR=apps/backup
ENTRYPOINT ["sh", "/app/runtime-domain.sh"]
