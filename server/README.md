# 🔧 PastePoint Server (Rust Backend)

The PastePoint server is a high-performance Rust-based backend built with Actix Web, providing WebSocket-based file sharing and communication services for local networks.

[![Actix](https://img.shields.io/badge/Actix-4.7-blue)](https://actix.rs/)
[![OpenSSL](https://img.shields.io/badge/OpenSSL-0.10-yellow)](https://www.openssl.org/)
[![Rust](https://img.shields.io/badge/Rust-Backend-orange)](https://www.rust-lang.org/)

## 🛠️ Tech Stack

- **Framework**: [Actix Web](https://actix.rs/) - High-performance async web framework
- **WebSockets**: Native Actix WebSocket support
- **Security**: [OpenSSL](https://www.openssl.org/) for TLS termination
- **Serialization**: [Serde](https://serde.rs/) for JSON handling
- **UUID**: UUID generation for session management
- **Logging**: Built-in logging with configurable levels

## 📁 Project Structure

```
server/
├── 📁 src/                        # Source code
├── 📁 config/                     # Configuration files
│   ├── development.toml           # Development configuration
│   ├── production.toml            # Production configuration
│   └── docker-dev.toml            # Docker development config
├── 📁 tests/                      # Tests
├── 📁 target/                     # Rust build artifacts
├── Cargo.toml                     # Project dependencies
├── Cargo.lock                     # Dependency lock file
├── Dockerfile                     # Docker configuration
└── README.md                      # Project documentation
```

## 🚀 Quick Start

### Prerequisites

- **Rust**: Nightly toolchain (specified in `../rust-toolchain`)
- **OpenSSL**: Required for SSL/TLS support
  - Linux: `sudo apt-get install libssl-dev pkg-config`
  - macOS: `brew install openssl pkg-config`
  - Windows: `winget install OpenSSL`

### Development Setup

1. **Navigate to server directory**:

   ```bash
   cd server
   ```

2. **Install dependencies**:

   ```bash
   cargo build
   ```

3. **Run development server**:

   ```bash
   cargo run
   ```

4. **Run with specific configuration**:
   ```bash
   RUST_BUILD_MODE=debug cargo run
   ```

## ⚙️ Configuration

### Configuration Files

- `config/development.toml`: Development environment settings
- `config/production.toml`: Production environment settings

## 🧪 Testing

### Run all tests:

```bash
cargo test
```

## 🔧 Development Guide

### Code Quality

- **Formatting**: `cargo fmt`
- **Linting**: `cargo clippy`
- **Security audit**: `cargo audit`

## 🔒 Security Features

- **TLS/SSL**: Full SSL/TLS support with configurable certificates
- **CORS**: Configurable Cross-Origin Resource Sharing
- **Input Validation**: Comprehensive input validation and sanitization

## 🐛 Troubleshooting

### Common Issues

1. **SSL Certificate Errors**:

   ```bash
   # Generate self-signed certificates
   ../scripts/generate-certs.sh
   ```

2. **Port Already in Use**:

   ```bash
   # Check what's using the port
   lsof -i :9000
   # Kill the process or change the port in config
   ```

3. **Permission Denied**:
   ```bash
   # Ensure proper permissions for SSL certificates
   sudo chown -R $USER:$USER /path/to/certs
   ```

## 🤝 Contributing

- [Contributing](../CONTRIBUTING.md)

## 📜 License

This project is licensed under the GPL-3.0 License. See the [LICENSE](../LICENSE) file for details.

## 🔗 Related Documentation

- [Main Project README](../README.md)
- [Client README](../client/README.md)
- [Docker Compose Setup](../docker-compose.yml)
