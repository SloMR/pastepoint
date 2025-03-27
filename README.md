<div align="center">
  <img src="client/public/pastepoint-light.svg" alt="PastePoint Logo" style="width: 250px; height: 250px"/>

![Docker](https://img.shields.io/badge/Docker-Containers-blue) ![Rust](https://img.shields.io/badge/Rust-Backend-orange) ![Angular](https://img.shields.io/badge/Angular-Frontend-red) [![Nginx](https://img.shields.io/badge/Nginx-Reverse_Proxy-green)](https://nginx.org)

</div>

# PastePoint

PastePoint is a secure, feature-rich file-sharing service designed for local networks. It enables users to share files and communicate efficiently through peer-to-peer WebSocket connections. Built with a Rust-based backend using Actix Web and an Angular frontend, PastePoint prioritizes security, performance, and usability.

[![GPL-3.0 License](https://img.shields.io/github/license/SloMR/pastepoint)](LICENSE)
[![Open Issues](https://img.shields.io/github/issues/SloMR/pastepoint)](https://github.com/SloMR/pastepoint/issues)

---

## 🌟 Features

### Core Features:

- **Local Network Communication**:

  - Establish WebSocket-based local chat between computers on the same network.
  - List available sessions, create new sessions, or join existing ones.

- **File Sharing**:

  - Peer-to-peer WebSocket connections for sending files and text.
  - File compression for efficient transfers.

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

---

## 🛠️ Tech Stack

### **Backend** (Rust)

[![Actix](https://img.shields.io/badge/Actix-4.7-blue)](https://actix.rs/)
[![OpenSSL](https://img.shields.io/badge/OpenSSL-0.10-yellow)](https://www.openssl.org/)

- **Framework**: Actix Web with WebSocket support
- **Security**: OpenSSL for TLS termination
- **Utilities**: UUID generation, Serde serialization

### **Frontend** (Angular)

[![Angular](https://img.shields.io/badge/Angular-19-red)](https://angular.io/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-blue)](https://tailwindcss.com/)
[![Flowbite](https://img.shields.io/badge/Flowbite-3.0-cyan)](https://flowbite.com/)

- **State Management**: RxJS observables
- **Styling**: Tailwind CSS with dark mode
- **I18n**: ngx-translate integration

### **Infrastructure**

[![Nginx](https://img.shields.io/badge/Nginx-Reverse_Proxy-green)](https://nginx.org)
[![Docker](https://img.shields.io/badge/Docker-24.0-blue)](https://www.docker.com)

- **Container Orchestration**: Docker Compose with multi-stage builds
- **Reverse Proxy**: Nginx with enhanced security features
- **SSL/TLS**: Automated certificate management
- **Health Monitoring**: Built-in health check endpoints

---

## Directory Structure

```
pastepoint/
├── client/        # Angular-based frontend
├── server/        # Rust-based backend
├── nginx/         # Nginx configuration and security settings
├── scripts/       # Shell scripts for SSL certificate generation
├── docker-compose.yml  # Docker Compose configuration
└── README.md      # Project documentation
```

### Key Files

#### Backend (Rust):

- `Cargo.toml`: Dependency definitions.
- `src/main.rs`: Entry point for the server.
- `src/lib.rs`: Server modules and routes.
- `config/`: Configuration files for development and production environments.
- `tests/`: Unit tests for the server.

#### Frontend (Angular):

- `angular.json`: Angular project configuration.
- `src/app/`: Angular application code.
- `public/`: Static assets.
- `src/app/core/i18n/`: Internationalization files.
- `src/app/core/services/`: Services for WebSocket communication.
- `src/environments/`: Environment configurations.

#### Deployment:

- `docker-compose.yml`: Manages containers for:
  - Backend service (Rust)
  - Frontend service (Angular)
  - Certificate checker service
  - Nginx reverse proxy
- `scripts/generate-certs.sh`: Script to generate self-signed certificates
- `scripts/prepare_prod.sh`: Script to update configurations for production
- `nginx/nginx.conf`: Main Nginx configuration
- `nginx/security_settings.conf`: Security and rate limiting settings
- `nginx/security_headers.conf`: Security headers configuration
- `nginx/locations.conf`: Location block configurations
- `nginx/ssl.conf`: SSL/TLS settings

---

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
   docker compose up --build
   ```

5. Access PastePoint:
   - 🔗 Frontend:
     - Localhost: [https://localhost](https://localhost)
     - Local Network: `https://<your-local-ip>`
   - 🔌 Backend API:
     - Localhost: [https://localhost:9000](https://localhost:9000)
     - Local Network: `https://<your-local-ip>:9000`
   - 🏥 Health Check:
     - Localhost: [https://localhost/health](https://localhost/health)
     - Local Network: `https://<your-local-ip>/health`

### Environment Variables:

- `CERT_PATH`: Path to SSL certificates (default: `/etc/ssl/pastepoint`)
- `CERT_MOUNT`: Certificate mount point in containers (default: `pastepoint`)
- `SERVER_NAME`: Server name for SSL (default: `pastepoint.com www.pastepoint.com`)
- `RUST_BUILD_MODE`: Rust build mode (default: `release`)
- `NPM_BUILD_CONFIG`: NPM build configuration (default: `docker`)
- `SERVER_ENV`: Server environment (default: `production`)

### Backend Development (Rust):

1. Navigate to the server directory:
   ```bash
   cd server
   ```
2. Build and run the server:
   ```bash
   cargo build
   cargo run
   ```

### Frontend Development (Angular):

1. Navigate to the client directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   ng serve
   ```

### Testing:

- **Backend Tests**:
  ```bash
  cargo test
  ```
- **Frontend Tests**:
  ```bash
  npm test
  ```

### Environment Configuration

- **Backend**:
  - `server/config/*.toml`: Update configurations for development and production environments.
- **Frontend**:
  - `client/src/environments/*`: Update environment variables for development and production.

---

## 🚨 Troubleshooting

**Common Issues**:

1. SSL Certificate Errors
   Run: `./scripts/generate-certs.sh`

2. Local Network Access Issues
   - Ensure your firewall allows connections on ports 80 and 443
   - Verify your local IP address is correctly configured using `./scripts/configure-network.sh`
   - Check that all services are running with `docker compose ps`
   - Verify SSL certificates are properly mounted in the containers

---

## 🤝 Contributing

**We welcome contributions! Please follow these steps**:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit changes following Conventional Commits
4. Push to branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request
6. After review, your changes will be merged
7. Celebrate your contribution!

**Code Standards**:

- **Rust**: Follow `rustfmt` and `clippy` rules
- **Angular**: Adhere to provided `.prettierrc` and `eslint` rules
- **Tests**: Maintain 80%+ coverage

---

## 📜 License

This project is licensed under the GPL-3.0 License. See the [LICENSE](LICENSE) file for details.

---

## 📬 Contact

For issues or feature requests:

- [🐙 GitHub Issues](https://github.com/SloMR/pastepoint/issuesm)
- [📧 sulaimanromaih@gmail.com](mailto:sulaimanromaih@gmail.com).

---

## 🔒 Security Considerations

- **Certificate Management**:

  - Replace self-signed certificates with proper SSL certificates in production
  - Keep private keys secure and never commit them to version control

- **Data Privacy**:
  - All file transfers are encrypted end-to-end
  - No data is stored permanently on servers
  - Session data is cleared on server restart or leaving the session

## 💾 Backup and Data Persistence

- **Session Data**: Ephemeral, cleared on restart or leaving the session
- **Configuration**:
  - Store SSL certificates securely
  - Version control for environment files

## 🔄 Version Compatibility

| Component | Minimum Version | Recommended Version | Notes                          |
| --------- | --------------- | ------------------- | ------------------------------ |
| Docker    | 20.10.0         | 24.0.0              | Required for BuildKit features |
| Node.js   | 18.0.0          | 22.14.0             | Required for Angular features  |
| Rust      | 1.75.0          | 1.85.0              | Required for async features    |
| Windows   | 10 (1909)       | 11 22H2             | WSL2 support needed            |
| Linux     | Kernel 5.4      | Kernel 6.x          | For optimal performance        |

## 🚀 Performance Recommendations

- **Hardware Requirements**:

  - CPU: 4+ cores recommended
  - RAM: 8GB minimum, 16GB recommended
  - Storage: SSD recommended for Docker containers

- **Network**:
  - Gigabit Ethernet recommended
  - Low latency network (<50ms) for optimal WebSocket performance
  - QoS settings for prioritizing WebSocket traffic
