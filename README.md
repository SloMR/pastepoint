<div align="center">
  <img src="client/public/pastepoint-light.svg" alt="PastePoint Logo" style="width: 250px; height: 250px"/>

<br>
<br>

![Docker](https://img.shields.io/badge/Docker-Containers-blue) ![Rust](https://img.shields.io/badge/Rust-Backend-orange) ![Angular](https://img.shields.io/badge/Angular-Frontend-red) [![Nginx](https://img.shields.io/badge/Nginx-Reverse_Proxy-green)](https://nginx.org)

</div>

# PastePoint

PastePoint is a secure, feature-rich file-sharing service designed for local networks. It enables users to share files and communicate efficiently through peer-to-peer WebSocket connections. Built with a Rust-based backend using Actix Web and an Angular frontend with SSR support, PastePoint prioritizes security, performance, and usability.

## ⚠️ Usage Disclaimer

- [📜 Disclaimer](DISCLAIMER.md)

## 🌟 Features

### Core Features:

- **Local Network Communication**:

  - Establish WebSocket-based local chat between computers on the same network.
  - List available sessions, create new sessions, or join existing ones.

- **File Sharing**:

  - Peer-to-peer WebSocket connections for sending files and text.
  - File compression for efficient transfers.
  - Optimized chunk-based file transfer with progress tracking.

- **Security**:

  - SSL/TLS encryption for secure communication.
  - Self-signed certificate generation included.

- **Cross-Platform Compatibility**:
  - Runs seamlessly on Linux, macOS, and Windows with Dockerized support.

### **Developer Experience**

- 🐳 Full Docker integration
- 📦 Isolated microservices architecture
- 🔧 Configurable environments (dev/prod)
- ✅ Comprehensive test suites

### **Performance & SEO**

- 🚀 Server-Side Rendering (SSR) for improved initial load time
- 🔍 Complete SEO optimization with metadata, sitemap, and robots.txt
- 📦 Response compression for faster page loads
- 🎯 Static asset optimization with proper caching headers

## 🛠️ Tech Stack

### **Server** (Rust)

[![Actix](https://img.shields.io/badge/Actix-4.7-blue)](https://actix.rs/)
[![OpenSSL](https://img.shields.io/badge/OpenSSL-0.10-yellow)](https://www.openssl.org/)

- **Framework**: Actix Web with WebSocket support
- **Security**: OpenSSL for TLS termination
- **Utilities**: UUID generation, Serde serialization

### **Clients**

#### Web (Angular)

[![Angular](https://img.shields.io/badge/Angular-19-red)](https://angular.io/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-blue)](https://tailwindcss.com/)
[![Flowbite](https://img.shields.io/badge/Flowbite-3.0-cyan)](https://flowbite.com/)

- **Rendering**: Server-Side Rendering with Angular Universal
- **State Management**: RxJS observables
- **Styling**: Tailwind CSS with dark mode
- **I18n**: ngx-translate integration

### **Infrastructure**

[![Nginx](https://img.shields.io/badge/Nginx-Reverse_Proxy-green)](https://nginx.org)
[![Docker](https://img.shields.io/badge/Docker-24.0-blue)](https://www.docker.com)
[![Express](https://img.shields.io/badge/Express-4.21-purple)](https://expressjs.com/)

- **Container Orchestration**: Docker Compose with multi-stage builds
- **Reverse Proxy**: Nginx with enhanced security features
- **SSL/TLS**: Automated certificate management
- **Health Monitoring**: Built-in health check endpoints
- **SSR Server**: Express.js with compression middleware

## Directory Structure

```
pastepoint/
├── 📁 client/                      # Angular frontend with SSR
├── 📁 server/                      # Rust backend with WebSockets
├── 📁 nginx/                       # Reverse proxy & SSL termination
├── 📁 scripts/                     # Development & deployment scripts
├── docker-compose.yml              # Multi-container orchestration
├── .nvmrc                          # Node.js version specification
├── rust-toolchain                  # Rust toolchain specification
├── Makefile                        # Makefile for development
└── README.md                       # Project documentation
```

#### Server (Rust):

- [Server readme](server/README.md)

#### Clients:

###### Web (Angular):

- [Web readme](client/README.md)

#### Deployment:

- `docker-compose.yml`: Manages containers for:
  - Backend service (Rust)
  - Frontend SSR service (Angular + Express)
  - Certificate checker service
  - Nginx reverse proxy
- `scripts/generate-certs.sh`: Script to generate self-signed certificates
- `scripts/prepare_prod.sh`: Script to update configurations for production
- `nginx/nginx.conf`: Main Nginx configuration
- `nginx/security_settings.conf`: Security and rate limiting settings
- `nginx/security_headers.conf`: Security headers configuration
- `nginx/locations.conf`: Location block configurations including SEO routes
- `nginx/ssl.conf`: SSL/TLS settings

## 🔧 Development Guide

### 🚀 Quick Start

### Prerequisites:

- Docker and Docker Compose
- Node.js (v22.4.0 as specified in `.nvmrc`)
- Rust (Nightly, specified in `rust-toolchain`)

#### Windows-Specific Requirements:

- Windows 10/11 with WSL2 enabled
- Docker Desktop for Windows
- Git Bash or PowerShell 7+ for running scripts
- OpenSSL installed via `winget install OpenSSL`

### Steps:

1. Clone the repository:

   ```bash
   git clone https://github.com/SloMR/pastepoint.git
   cd pastepoint
   ```

2. Generate SSL certificates (required for HTTPS):

   ```bash
   ./scripts/generate-certs.sh
   ```

3. Configure for Local Network (Optional):
   If you want to run PastePoint on your local network instead of just localhost:

   ```bash
   ./scripts/configure-network.sh
   ```

   This will prompt you to enter your local IP address and update all necessary configuration files.

4. Build and Start Services:

   ```bash
   make dev # or make prod
   ```

5. Access PastePoint:
   - 🔗 Frontend:
     - Localhost: [https://localhost](https://localhost)
     - Local Network: `https://<your-local-ip>`
   - 🔌 Server API:
     - Localhost: [https://localhost:9000](https://localhost:9000)
     - Local Network: `https://<your-local-ip>:9000`

### Environment Variables:

- `CERT_PATH`: Path to SSL certificates (default: `/etc/ssl/pastepoint`)
- `SERVER_NAME`: Server name for SSL (default: `pastepoint.com www.pastepoint.com`)
- `RUST_BUILD_MODE`: Rust build mode (default: `release`)
- `NPM_BUILD_CONFIG`: npm build configuration (default: `docker`)
- `SERVER_ENV`: Server environment (default: `production`)
- `PORT`: SSR server port (default: `4000`)
- `HOST`: SSR server host (default: `0.0.0.0`)

## 🤝 Contributing

- [Contributing](CONTRIBUTING.md)

## 🚨 Troubleshooting

**Common Issues**:

1. SSL Certificate Errors
   Run: `./scripts/generate-certs.sh`

## 🔒 Security Considerations

- **Certificate Management**:

  - Replace self-signed certificates with proper SSL certificates in production
  - Keep private keys secure and never commit them to version control

- **Data Privacy**:

  - All file transfers are encrypted end-to-end
  - No data is stored permanently on servers
  - Session data is cleared on server restart or leaving the session

## 📜 License

This project is licensed under the GPL-3.0 License. See the [LICENSE](LICENSE) file for details.

## 📬 Contact

For issues or feature requests:

- [🐙 GitHub Issues](https://github.com/SloMR/pastepoint/issues)
- [📧 sulaimanromaih@gmail.com](mailto:sulaimanromaih@gmail.com).
- [🌐 LinkedIn](https://www.linkedin.com/in/sulaiman-alromaih-845700202/)
