# syntax=docker/dockerfile:1.6
#
# apps/backup-worker — mongodump/mongorestore çalıştıran bağımsız Node servisi
# (Next.js yok). apps/downloader-worker desenini izler: tsx runtime, node:http,
# x-internal-secret. Build context = monorepo root.
#
# ⚠ DEBIAN base (alpine DEĞİL): MongoDB Database Tools resmi olarak yalnız glibc
# (debian/ubuntu/rhel) için derlenir — musl/alpine binary'si yoktur. deps stage
# de debian (oven/bun:1.2, glibc) → esbuild/tsx binary'si runner ile aynı libc.
# version.sh --platform linux/amd64 build eder → x86_64 tools tarball'u indirilir.

# ── deps (debian bun, glibc node_modules) ───────────────────────────────────
FROM oven/bun:1.2 AS deps
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

# ── runner (debian slim + mongodb-database-tools) ───────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# mongodump/mongorestore — resmi MongoDB Database Tools tarball (debian12 x86_64).
# ⚠ mongodump `libgssapi_krb5.so.2` (Kerberos/GSSAPI) runtime dep'ine bağlıdır →
# `libgssapi-krb5-2` AÇIKÇA kurulur ve TUTULUR. curl'ü purge + autoremove ETME:
# autoremove krb5 lib'ini de söküyordu → `mongodump: cannot open libgssapi_krb5.so.2`
# (exit 127). curl/ca-certs kalması zararsız (~birkaç MB).
ARG MONGO_TOOLS_VERSION=100.12.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gzip libgssapi-krb5-2 \
  && curl -fsSL "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-x86_64-${MONGO_TOOLS_VERSION}.tgz" -o /tmp/tools.tgz \
  && tar -xzf /tmp/tools.tgz -C /tmp \
  && cp /tmp/mongodb-database-tools-*/bin/mongodump /tmp/mongodb-database-tools-*/bin/mongorestore /usr/local/bin/ \
  && chmod +x /usr/local/bin/mongodump /usr/local/bin/mongorestore \
  && rm -rf /tmp/tools.tgz /tmp/mongodb-database-tools-* /var/lib/apt/lists/* \
  && mongodump --version

ENV NODE_ENV=production
ENV PORT=4400
ENV WORK_DIR=/tmp/backups

RUN groupadd -r nodejs -g 1001 \
  && useradd -r -u 1001 -g nodejs worker \
  && mkdir -p /tmp/backups && chown worker:nodejs /tmp/backups

COPY --from=deps --chown=worker:nodejs /repo/node_modules ./node_modules
COPY --chown=worker:nodejs apps/backup-worker ./apps/backup-worker
COPY --chown=worker:nodejs package.json ./package.json
COPY --chown=worker:nodejs tsconfig.json ./tsconfig.json

USER worker
EXPOSE 4400

WORKDIR /app/apps/backup-worker
CMD ["node", "--import", "tsx", "src/main.ts"]
