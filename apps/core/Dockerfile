# syntax=docker/dockerfile:1.6
#
# apps/core — platform gateway (landing, auth, public API, admin, company CRUD).
# Build context = monorepo root. Coolify her service için bu Dockerfile path'ini
# ("apps/core/Dockerfile") ve build context'ini (repo kökü) kullanır.
#
# Install adımı bun ile (hızlı + bun.lock kullanır), build ve runtime node
# ile yapılır — Next.js 16 SWC native modül'leri bun'ın napi desteğiyle tam
# uyumlu değil (worker_threads + napi_register_module_v1).

# ── deps ──────────────────────────────────────────────────────────────────
# Lock + manifests kopyalanır → `bun install` layer cache'e düşer.
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
# Next.js SWC native binary'leri glibc arıyor — Alpine'da shim lazım.
RUN apk add --no-cache libc6-compat

COPY --from=deps /repo/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Build sırasında auth.ts top-level await'i clientPromise'i resolve eder
# (mongodbAdapter db requires). Gerçek connection runtime env'le açılır;
# build için yer-tutucu URI yeterli — MongoDB driver `connect()` ilk
# operation'a kadar TCP açmadığı için page collection sırasında DNS
# fail vermez.
ARG MONGODB_URI=mongodb://placeholder:27017/build
ARG BETTER_AUTH_SECRET=build-placeholder-secret
ENV MONGODB_URI=$MONGODB_URI
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET

# NEXT_PUBLIC_* env'leri Next.js client bundle'a ve edge middleware'e
# build-time'da inline edilir — runtime override etkisizdir. Default değer
# yok bilerek: eksikse build patlasın da prod'a `http://localhost:*` sızmasın.
ARG NEXT_PUBLIC_CORE_APP_URL
ARG NEXT_PUBLIC_MAIL_APP_URL
ARG NEXT_PUBLIC_STORAGE_APP_URL
ARG NEXT_PUBLIC_WHATSAPP_APP_URL
ARG NEXT_PUBLIC_LINEAR_APP_URL
ARG NEXT_PUBLIC_SENTROY_API_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_TURNSTILE_DISABLED
ENV NEXT_PUBLIC_CORE_APP_URL=$NEXT_PUBLIC_CORE_APP_URL
ENV NEXT_PUBLIC_MAIL_APP_URL=$NEXT_PUBLIC_MAIL_APP_URL
ENV NEXT_PUBLIC_STORAGE_APP_URL=$NEXT_PUBLIC_STORAGE_APP_URL
ENV NEXT_PUBLIC_WHATSAPP_APP_URL=$NEXT_PUBLIC_WHATSAPP_APP_URL
ENV NEXT_PUBLIC_LINEAR_APP_URL=$NEXT_PUBLIC_LINEAR_APP_URL
ENV NEXT_PUBLIC_SENTROY_API_URL=$NEXT_PUBLIC_SENTROY_API_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_DISABLED=$NEXT_PUBLIC_TURNSTILE_DISABLED

# Next.js production build SWC + Webpack ile büyükçe route grafiğinde Node'un
# default 1.5 GB heap limit'ini aşabilir → Coolify'da sessiz "exit code 1".
ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /repo/apps/core
RUN npx next build
WORKDIR /repo

# ── runner ────────────────────────────────────────────────────────────────
# Next.js standalone output: `.next/standalone/` içinde minimal node_modules
# + ilgili workspace packages + server.js bulunur; imajı küçük tutar.
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/core/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/core/.next/static ./apps/core/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/core/public ./apps/core/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/core/server.js"]
