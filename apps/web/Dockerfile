FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/schema/package.json ./packages/schema/
COPY apps/server/package.json ./apps/server/
COPY apps/proxy/package.json ./apps/proxy/
COPY apps/web/package.json ./apps/web/

RUN npm install --workspace=apps/web --include-workspace-root

COPY packages/schema ./packages/schema
COPY apps/web ./apps/web

RUN npm run build --workspace=apps/web

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /var/run \
  && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
