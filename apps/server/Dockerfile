FROM node:22-alpine AS builder

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
RUN npm run build --workspace=apps/server

# Migration image (#22): reuses the builder (which has the Prisma CLI, schema,
# and migrations) to run `prisma migrate deploy`. The runtime `runner` image
# below ships no node_modules, so migrations can't run from it — the Helm chart
# runs this image as a pre-install/upgrade Job. Kept before `runner` so `runner`
# stays the default build target.
FROM builder AS migrate
WORKDIR /app/apps/server
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/server/dist/index.mjs ./apps/server/dist/index.mjs
COPY --from=builder /app/apps/server/dist/index.mjs.map ./apps/server/dist/index.mjs.map
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/apps/server/prisma.config.ts ./apps/server/

WORKDIR /app/apps/server

RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.mjs"]
