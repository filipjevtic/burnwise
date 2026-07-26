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

# Build same-origin: the SPA calls /api/... on its own host, which nginx proxies
# to the server (#22), so one image works in dev/compose/k8s without a rebuild.
ENV VITE_API_URL=""
RUN npm run build --workspace=apps/web

FROM nginx:alpine AS runner

# nginx renders this template at start, substituting BURNWISE_SERVER_URL (the
# only referenced env var) into the /api proxy target.
ENV BURNWISE_SERVER_URL="http://localhost:3000"

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template

# Writable by the unprivileged nginx user: /var/* for runtime, and
# /etc/nginx/conf.d so the entrypoint's envsubst can write the rendered config.
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /var/run /etc/nginx/conf.d \
  && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
