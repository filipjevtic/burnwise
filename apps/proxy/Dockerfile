FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/schema/package.json ./packages/schema/
COPY apps/server/package.json ./apps/server/
COPY apps/proxy/package.json ./apps/proxy/
COPY apps/web/package.json ./apps/web/

RUN npm install --workspace=apps/proxy --include-workspace-root

COPY packages/schema ./packages/schema
COPY apps/proxy ./apps/proxy

RUN find /app/packages -name "*.tsbuildinfo" -delete && npm run build --workspace=packages/schema
RUN npm run build --workspace=apps/proxy

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/schema/dist ./packages/schema/dist
COPY --from=builder /app/packages/schema/package.json ./packages/schema/
COPY --from=builder /app/apps/proxy/dist ./apps/proxy/dist
COPY --from=builder /app/apps/proxy/package.json ./apps/proxy/

WORKDIR /app/apps/proxy

EXPOSE 4000

CMD ["node", "dist/index.js"]
