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

EXPOSE 443
CMD ["nginx", "-g", "daemon off;"]
