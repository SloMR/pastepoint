# ---------- Stage 1: Build the Angular app ----------
FROM node:22.14.0 AS builder
WORKDIR /usr/src/app

ARG NPM_BUILD_CONFIG=docker

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build -- --configuration=$NPM_BUILD_CONFIG

# ---------- Stage 2: SSR Server ----------
FROM node:22.14.0-alpine AS ssr
WORKDIR /usr/src/app

# Install wget
RUN apk add --no-cache wget

# Copy built artifacts & package files
COPY --from=builder /usr/src/app/dist /usr/src/app/dist
COPY --from=builder /usr/src/app/package*.json ./

# Install only prod deps
RUN npm ci --omit=dev

# Expose SSR server port
EXPOSE 4000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --spider -q http://localhost:4000/ || exit 1

# Launch SSR server
CMD ["node", "dist/client/server/server.mjs"]

# ---------- Stage 3: NGINX to reverse proxy SSR ----------
FROM nginx:alpine AS nginx

# Install envsubst if needed
RUN apk add --no-cache gettext=0.22.5-r0

# Copy build artifacts
COPY --from=builder /usr/src/app/dist/client/browser/robots.txt /usr/share/nginx/html/browser/robots.txt
COPY --from=builder /usr/src/app/dist/client/browser/sitemap.xml /usr/share/nginx/html/browser/sitemap.xml

# Copy nginx config files
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY nginx/security_headers.conf /etc/nginx/security_headers.conf
COPY nginx/security_settings.conf /etc/nginx/security_settings.conf
COPY nginx/ssl.conf /etc/nginx/ssl.conf
COPY nginx/locations.conf /etc/nginx/locations.conf

# Copy the entrypoint script and make it executable
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh && \
    chown nginx:nginx /docker-entrypoint.sh && \
    chown nginx:nginx /etc/nginx/conf.d/default.conf.template

# Create directories and set appropriate permissions for the nginx user
RUN mkdir -p /var/cache/nginx/client_temp /var/run/nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /var/run/nginx && \
    chown nginx:nginx /var/run/nginx.pid && \
    chmod 644 /var/run/nginx.pid && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /etc/nginx/conf.d

# Expose HTTPS port
EXPOSE 443

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --spider -q http://localhost || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
