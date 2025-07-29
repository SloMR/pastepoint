# ---------- Stage 1: Build the Angular app ----------
FROM node:22.14.0-slim AS builder
WORKDIR /usr/src/app

ARG NPM_BUILD_CONFIG=docker

# Copy package.json and package-lock.json first for better caching
COPY client/package*.json ./

# Use npm ci for consistent installs and clean up cache
RUN --mount=type=cache,target=/root/.npm \
    npm ci && npm cache clean --force

# Copy application code
COPY client/ ./

# Build the application
RUN npm run build -- --configuration=$NPM_BUILD_CONFIG

# ---------- Stage 2: SSR Server ----------
FROM node:22.14.0-alpine AS ssr
WORKDIR /usr/src/app

# Install only necessary packages
RUN apk add --no-cache wget=1.25.0-r0

# Copy built artifacts & package files
COPY --from=builder /usr/src/app/dist /usr/src/app/dist
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/package-lock.json ./

# Install only prod deps and clean npm cache
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production && npm cache clean --force && \
    rm -rf /tmp/* /usr/src/app/node_modules/.cache

# Create a non-root user
USER node

# Expose SSR server port
EXPOSE 4000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --spider -q http://localhost:4000/ || exit 1

# Launch SSR server
CMD ["node", "dist/client/server/server.mjs"]

# ---------- Stage 3: NGINX to reverse proxy SSR ----------
FROM nginx:1.27-alpine-slim AS nginx

# Install only necessary packages
RUN apk add --no-cache gettext=0.22.5-r0

# Copy only the specific static files needed
COPY --from=builder /usr/src/app/dist/client/browser/robots.txt /usr/share/nginx/html/browser/robots.txt
COPY --from=builder /usr/src/app/dist/client/browser/sitemap.xml /usr/share/nginx/html/browser/sitemap.xml

# Copy nginx config files
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY nginx/ssl.conf /etc/nginx/ssl.conf
COPY nginx/locations.conf /etc/nginx/locations.conf
COPY nginx/security/ /etc/nginx/security/
COPY nginx/includes/ /etc/nginx/includes/

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

# Switch to nginx user
USER nginx

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --spider -q http://localhost || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]