FROM node:20-alpine AS base
RUN apk add --no-cache openssl python3 make g++
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Development
FROM base AS development
COPY package.json package-lock.json* ./
RUN npm ci
COPY prisma ./prisma/
RUN npx prisma generate
COPY src ./src/
COPY tsconfig.json ./
CMD ["npm", "run", "dev"]

# Build
FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY prisma ./prisma/
RUN npx prisma generate
COPY src ./src/
COPY tsconfig.json ./
RUN npm run build

# Production
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma/
COPY package.json ./

EXPOSE 3000

COPY prisma/seed.ts ./prisma/seed.ts
RUN npm install -g tsx

CMD ["sh", "-c", "npx prisma db push --skip-generate && tsx prisma/seed.ts && node dist/index.js"]
