# Multi-stage Dockerfile using Bun exclusively for mcp-router

# Stage 1: Build Frontend SPA
FROM oven/bun:alpine AS web-builder
WORKDIR /app
COPY package.json bun.lock* ./
COPY src/web/package.json ./src/web/
RUN bun install
COPY src/web ./src/web
COPY src/lib ./src/lib
RUN cd src/web && bun run build

# Stage 2: Production Dependencies
FROM oven/bun:alpine AS backend-deps
WORKDIR /app
COPY package.json bun.lock* ./
COPY src/web/package.json ./src/web/
RUN bun install --production

# Stage 3: Production Runtime
FROM oven/bun:alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

# Create non-root user for security
RUN addgroup -S mcp && adduser -S mcp -G mcp

# Setup persistence directory
RUN mkdir -p /data && chown -R mcp:mcp /data

COPY --from=backend-deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY --from=web-builder /app/src/web/dist ./public

RUN chown -R mcp:mcp /app
USER mcp

EXPOSE 5170

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5170/health || exit 1

ENV PORT=5170
ENV HOST=0.0.0.0
ENV AUTH_MODE=docker
ENV DATA_DIR=/data
ENV DATABASE_PATH=/data/mcp_router.db
ENV PUBLIC_DIR=/app/public

CMD ["bun", "src/index.ts"]
