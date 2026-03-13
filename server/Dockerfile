# syntax=docker/dockerfile:1.5
# Stage 1: Build the Rust app (Alpine for musl-linked binary)
FROM rust:1.93.1-alpine AS builder
WORKDIR /usr/src/app

ARG RUST_BUILD_MODE=release

# Install build dependencies (Alpine/musl)
RUN apk add --no-cache openssl-dev openssl-libs-static musl-dev pkgconf

# Statically link OpenSSL so runtime image doesn't need libssl
ENV OPENSSL_STATIC=1 OPENSSL_NO_VENDOR=1

# Copy the Cargo.toml and Cargo.lock files
COPY server/Cargo.toml server/Cargo.lock ./
COPY rust-toolchain rust-toolchain

# Create an empty lib.rs and main.rs to allow cargo to build dependencies
RUN mkdir -p src && echo "fn main() {}" > src/main.rs

# Build dependencies
RUN --mount=type=cache,target=/usr/local/cargo/registry \
  --mount=type=cache,target=/usr/local/cargo/git/db \
  if [ "$RUST_BUILD_MODE" = "release" ]; then \
  cargo build --release; \
  else \
  cargo build; \
  fi

# Now copy the source files and overwrite the dummy files
COPY server/src ./src
COPY server/config ./config

# Final build with actual source code
RUN --mount=type=cache,target=/usr/local/cargo/registry \
  --mount=type=cache,target=/usr/local/cargo/git/db \
  if [ "$RUST_BUILD_MODE" = "release" ]; then \
  cargo build --release && \
  strip target/release/server_bin && \
  cp target/release/server_bin /usr/src/app/server_bin; \
  else \
  cargo build && \
  strip target/debug/server_bin && \
  cp target/debug/server_bin /usr/src/app/server_bin; \
  fi

# Stage 2: Create a minimal runtime image
FROM alpine:3.21

WORKDIR /usr/local/bin

# Install only runtime dependencies
RUN apk add --no-cache ca-certificates wget

# Copy only the built binary from the builder stage
COPY --from=builder /usr/src/app/server_bin .

# Copy the config files into the final image
COPY server/config ./config

# Create a non-root user
RUN adduser -D appuser
USER appuser

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --spider -q http://localhost:9000/health || exit 1

# Set the command to run the binary
CMD ["./server_bin"]