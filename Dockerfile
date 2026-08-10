# Multi-stage Dockerfile using Bun exclusively

# Stage 1: Build Frontend SPA using Bun
FROM oven/bun:alpine AS web-builder
WORKDIR /app/web
COPY src/web/package.json ./
RUN bun install
COPY src/web ./
RUN bun run build

# Stage 2: Production Bun Runtime
FROM oven/bun:alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

COPY package.json bun.lock* ./
RUN bun install --production

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY --from=web-builder /app/web/dist ./public

RUN mkdir -p /data

EXPOSE 5170

ENV PORT=5170
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/data/mcp_router.db
ENV PUBLIC_DIR=/app/public

CMD ["bun", "src/index.ts"]
