# Stage 1: Build the Angular app
FROM node:22.6.0 AS builder
WORKDIR /usr/src/app

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build -- --configuration=docker

# Stage 2: NGINX serve
FROM nginx:alpine

# Copy build artifacts
COPY --from=builder /usr/src/app/dist/client/browser /usr/share/nginx/html/browser

# Copy our recommended nginx.conf or template-based config
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

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
USER nginx

EXPOSE 443
CMD ["nginx", "-g", "daemon off;"]
