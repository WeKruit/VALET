# ---- Build Stage ----
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.json ./

# Copy package manifests for all workspaces (for install cache)
COPY apps/worker/package.json ./apps/worker/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/llm/package.json ./packages/llm/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

# Build only the worker and its dependencies
RUN pnpm turbo build --filter=@valet/worker

# Prune dev dependencies
RUN pnpm prune --prod

# ---- Runtime Stage ----
FROM node:20-slim AS runtime

# Install browser dependencies for Stagehand/Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built output and production dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/packages/ ./packages/

# Non-root user for security
RUN addgroup --system --gid 1001 valet && \
    adduser --system --uid 1001 --ingroup valet valet
USER valet

ENV NODE_ENV=production

ENTRYPOINT ["tini", "--"]
CMD ["node", "apps/worker/dist/main.js"]
