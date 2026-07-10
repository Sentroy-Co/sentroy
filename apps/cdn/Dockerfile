# syntax=docker/dockerfile:1.6
#
# apps/cdn — Sentroy CDN / medya servisi (Express 5 + Sharp + S3 + mongoose).
# edrive-cdn v2 ile BİRE BİR build: kendi `npm install` + `tsc` (bun workspace
# deps stage KULLANMAZ — sharp/vips/ffmpeg native deps'i deterministik kalsın,
# shared lockfile'a bulaşmasın). Build context = monorepo root; yalnız apps/cdn
# kopyalanır.
#
# vips: sharp (image transforms) · ffmpeg: video first-frame (services/convert.ts)
# poppler-utils: pdftoppm (PDF → PNG). version.sh --platform linux/amd64 build eder.
FROM node:22-alpine

RUN apk add --no-cache vips ffmpeg poppler-utils

WORKDIR /app

COPY apps/cdn/package.json ./
RUN npm install --os=linux --cpu=x64 --libc=musl

COPY apps/cdn/tsconfig.json ./
COPY apps/cdn/src ./src
RUN npx tsc && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=4100
EXPOSE 4100

CMD ["node", "dist/server.js"]
