FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for all workspaces.
COPY package.json package-lock.json* ./
COPY packages/schema/package.json ./packages/schema/
COPY apps/server/package.json ./apps/server/
COPY apps/proxy/package.json ./apps/proxy/
COPY apps/web/package.json ./apps/web/

RUN npm install --workspace=apps/server --include-workspace-root

# Copy source and build.
COPY packages/schema ./packages/schema
COPY apps/server ./apps/server

RUN find /app/packages -name "*.tsbuildinfo" -delete && npm run build --workspace=packages/schema
RUN npm run db:generate --workspace=apps/server
RUN npm run build --workspace=apps/server

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/schema/dist ./packages/schema/dist
COPY --from=builder /app/packages/schema/package.json ./packages/schema/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma

WORKDIR /app/apps/server

EXPOSE 3000

CMD ["node", "dist/index.js"]
