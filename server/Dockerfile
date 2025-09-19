# syntax=docker/dockerfile:1.5
# Stage 1: Build the Rust app
FROM rust:1.86.0-slim AS builder
WORKDIR /usr/src/app

ARG RUST_BUILD_MODE=release

# Install build dependencies
# hadolint ignore=DL3008
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt-get update && apt-get install -y --no-install-recommends \
  libssl-dev \
  pkg-config \
  && rm -rf /var/lib/apt/lists/*

# Copy the Cargo.toml and Cargo.lock files
COPY server/Cargo.toml server/Cargo.lock ./
COPY ../rust-toolchain rust-toolchain

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
FROM debian:stable-slim

WORKDIR /usr/local/bin

# Install only runtime dependencies (not build dependencies)
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  libssl3 \
  curl \
  && rm -rf /var/lib/apt/lists/*

# Copy only the built binary from the builder stage
COPY --from=builder /usr/src/app/server_bin .

# Copy the config files into the final image
COPY server/config ./config

# Create a non-root user
RUN useradd -m appuser
USER appuser

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl --fail http://localhost:9000/health || exit 1

# Set the command to run the binary
CMD ["./server_bin"]