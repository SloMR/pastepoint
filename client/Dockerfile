# Stage 1: Build the Angular app
FROM node:22.6-alpine3.19 AS builder

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY client/package*.json ./
RUN npm ci

# Copy the rest of the application code
COPY client/ .

# Build the application
RUN npm run build --prod

# Stage 2: Serve the application using nginx
FROM nginx:alpine

# Copy the certificates
COPY certs /etc/ssl/certs/

# Copy the build output from the builder stage
COPY --from=builder /usr/src/app/dist/client/browser /usr/share/nginx/html/browser

# Copy the custom nginx configuration
COPY nginx/nginx.conf /etc/nginx/templates/default.conf.template

# Expose port 443 for HTTPS
EXPOSE 443

# Start nginx server
CMD ["nginx", "-g", "daemon off;"]
