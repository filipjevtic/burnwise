FROM node:20-alpine3.20 AS builder

WORKDIR /app

# Install dependencies for all workspaces.
COPY package.json package-lock.json* ./
COPY packages/schema/package.json ./packages/schema/
COPY packages/pricing/package.json ./packages/pricing/
COPY apps/server/package.json ./apps/server/
COPY apps/proxy/package.json ./apps/proxy/
COPY apps/web/package.json ./apps/web/

RUN npm install --workspace=apps/server --include-workspace-root

# Copy source and build.
COPY packages/schema ./packages/schema
COPY packages/pricing ./packages/pricing
COPY apps/server ./apps/server

RUN find /app/packages -name "*.tsbuildinfo" -delete \
  && npm run build --workspace=packages/schema \
  && npm run build --workspace=packages/pricing
RUN npm run db:generate --workspace=apps/server
RUN npm run build --workspace=apps/server

FROM node:20-alpine3.20 AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/schema/dist ./packages/schema/dist
COPY --from=builder /app/packages/schema/package.json ./packages/schema/
COPY --from=builder /app/packages/pricing/dist ./packages/pricing/dist
COPY --from=builder /app/packages/pricing/package.json ./packages/pricing/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma

WORKDIR /app/apps/server

RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
