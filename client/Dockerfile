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

# Create a custom directory for Nginx to store runtime files
RUN mkdir -p /var/cache/nginx/client_temp && \
    mkdir -p /var/run/nginx && \
    mkdir -p /var/log/nginx && \
    # Adjust permissions but stay as root (nginx typically runs as root initially)
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /var/run/nginx && \
    # Make the Nginx HTML directory accessible
    chown -R nginx:nginx /usr/share/nginx/html/browser

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost || exit 1

EXPOSE 443
CMD ["nginx", "-g", "daemon off;"]
