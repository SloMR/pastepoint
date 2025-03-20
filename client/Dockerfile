# Stage 1: Build the Angular app
FROM node:22.14.0 AS builder
WORKDIR /usr/src/app

ARG NPM_BUILD_CONFIG=docker

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build -- --configuration=$NPM_BUILD_CONFIG

# Stage 2: NGINX serve
FROM nginx:alpine

# Install envsubst for env variable substitution in nginx.conf
RUN apk add --no-cache gettext=0.22.5-r0

# Copy build artifacts
COPY --from=builder /usr/src/app/dist/client/browser /usr/share/nginx/html/browser

# Copy our recommended nginx.conf or template-based config
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf

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
    chown -R nginx:nginx /usr/share/nginx/html

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost || exit 1

# Use the non-root nginx user
RUN chown -R nginx:nginx /etc/nginx/conf.d
USER nginx

# Set environment variables for NGINX
ENTRYPOINT ["/docker-entrypoint.sh"]

EXPOSE 443
CMD ["nginx", "-g", "daemon off;"]
