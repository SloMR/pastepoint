# <img src="https://raw.githubusercontent.com/SloMR/pastepoint/main/client/public/pastepoint.svg" alt="PastePoint Logo" style="vertical-align: center; margin-right: 0.5em; width: 32px; height: 32px"/> PastePoint
![Docker](https://img.shields.io/badge/Docker-Containers-blue) ![Rust](https://img.shields.io/badge/Rust-Backend-orange) ![Angular](https://img.shields.io/badge/Angular-Frontend-red)

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

---

## Directory Structure

```
pastepoint/
├── client/        # Angular-based frontend
├── server/        # Rust-based backend
├── nginx/         # Nginx configuration
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
- `src/app/core/environments/`: Environment configurations.

#### Deployment:
- `docker-compose.yml`: Manages containers for the backend, frontend, and SSL certificate generator.
- `scripts/generate-certs.sh`: Script to generate self-signed certificates.
- `scripts/prepare_prod.sh`: Script to update configurations for production.
- `nginx/nginx.conf`: Nginx configuration for HTTPS and reverse proxy.

---
## 🔧 Development Guide

### 🚀 Quick Start

### Prerequisites:
- Docker and Docker Compose
- Node.js (v22.4.0 as specified in `.nvmrc`)
- Rust (Nightly, specified in `rust-toolchain`)

### Steps:
1. Clone the repository:
   ```bash
   git clone https://github.com/SloMR/pastepoint.git
   cd pastepoint
   ```

2. Build and Start Services:
   ```bash
   docker-compose up --build
   ```

3. Access PastePoint:
    - 🔗 Frontend: [https://localhost](https://localhost)
    - 🔌 Backend API: [https://localhost:9000](https://localhost:9000)

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
    - `client/src/app/core/environments/*`: Update environment variables for development and production.

---

## 🚨 Troubleshooting

**Common Issues**:
1. SSL Certificate Errors
    Run: `./scripts/generate-certs.sh`

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
