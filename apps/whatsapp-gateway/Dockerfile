# syntax=docker/dockerfile:1.6
#
# apps/whatsapp-gateway — kalıcı Baileys WhatsApp socket servisi (Node.js,
# Next.js yok). apps/status-worker desenini izler: tsx runtime, full monorepo
# kopyası (workspace path resolution için).
# Build context = monorepo root.

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

# tsx runtime ile çalışır; tsc build skip (status-worker ile aynı gerekçe).
WORKDIR /repo

# ── runner ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV PORT=4200

RUN addgroup -S nodejs -g 1001 && adduser -S worker -u 1001 -G nodejs

COPY --from=builder --chown=worker:nodejs /repo/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /repo/packages ./packages
COPY --from=builder --chown=worker:nodejs /repo/apps/whatsapp-gateway ./apps/whatsapp-gateway
COPY --from=builder --chown=worker:nodejs /repo/package.json ./package.json
COPY --from=builder --chown=worker:nodejs /repo/tsconfig.json ./tsconfig.json

USER worker
EXPOSE 4200

WORKDIR /app/apps/whatsapp-gateway
CMD ["node", "--import", "tsx", "src/main.ts"]
