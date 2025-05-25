# 🤝 Contributing to PastePoint

Thank you for your interest in contributing to PastePoint! This guide covers the essential workflow and standards for contributing.

## 📋 Quick Guide

1. **Fork & Clone** the repository
2. **Create a branch** following our [naming conventions](#-branch-naming)
3. **Make changes** following our [code standards](#-code-standards)
4. **Write tests** and ensure they pass
5. **Commit** using [conventional commits](#-commit-messages)
6. **Submit a Pull Request**

## 🔄 Development Workflow

```bash
# 1. Sync with upstream
git checkout main
git pull upstream main

# 2. Create feature branch
git checkout -b feat/your-feature-name

# 3. Make changes and test
# ... your development work ...

# 4. Commit changes
git commit -m "Client: your change description"

# 5. Push and create PR
git push origin feat/your-feature-name
```

## 🌿 Branch Naming

Use descriptive branch names with these prefixes:

| Prefix      | Purpose           | Example                       |
| ----------- | ----------------- | ----------------------------- |
| `feat/`     | New features      | `feat/file-compression`       |
| `fix/`      | Bugfixes          | `fix/websocket-connection`    |
| `docs/`     | Documentation     | `docs/api-endpoints`          |
| `style/`    | Code formatting   | `style/rust-clippy-fixes`     |
| `refactor/` | Code refactoring  | `refactor/session-management` |
| `test/`     | Adding tests      | `test/websocket-handlers`     |
| `chore/`    | Maintenance tasks | `chore/update-dependencies`   |

## 📝 Commit Messages

```
Scope: <description>

[optional body]

[optional footer]
```

### Types & Scopes

| Scope Options                                    | Example                        |
| ------------------------------------------------ | ------------------------------ |
| `Client`, `Server`, `Nginx`, `Docker`, `Scripts` | `Client: add dark mode toggle` |

### Examples

```bash
# Simple commits
git commit -m "Client: implement file drag and drop"
git commit -m "Server: handle websocket disconnection gracefully"
git commit -m "Docs: update troubleshooting section"

# Detailed commit with body
git commit -m "Client: add real-time file transfer progress

- Implement progress bar component
- Add transfer speed calculation
- Update UI to show transfer status

Closes #123"
```

## 🎯 Code Standards

### Rust (Server)

```bash
cargo fmt          # Format code
cargo clippy       # Check for issues
cargo test         # Run tests
```

**Requirements:**

- Address all `clippy` warnings
- Write tests for new features
- Add documentation comments for public APIs

### Client (Angular)

```bash
npm run format     # Format code
npm run lint:fix   # Lint code
npm run test:ci    # Run tests
```

**Requirements:**

- Follow Angular style guide
- Use TypeScript strict mode
- Use reactive programming with RxJS

### General Guidelines

- **Files**: Use kebab-case (`user-service.ts`) in Client and snake_case (`user_name`) in Server
- **Variables**: Use camelCase (`userName`) in TypeScript and snake_case (`user_name`) in Server
- **Constants**: Use UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)
- **Comments**: Explain "why", not "what"
- **Error handling**: Always handle errors gracefully

## 🧪 Building

```bash
# Client Build
cd client && npm run build

# Server Build
cd server && cargo build

# Docker Compose
make dev
```

## 🆘 Need Help?

- Check [existing issues](https://github.com/SloMR/pastepoint/issues)
- Read project README files
- Contact maintainers

Thank you for contributing! 🚀
