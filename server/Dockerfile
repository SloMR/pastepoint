# Stage 1: Build the Rust app
FROM rust:1.85.0 AS builder

WORKDIR /usr/src/app

# Copy the Cargo.toml and Cargo.lock files
COPY server/Cargo.toml server/Cargo.lock ./
COPY ../rust-toolchain rust-toolchain

# Create an empty main.rs to allow cargo to build dependencies
RUN mkdir -p src && echo "fn main() {}" > src/main.rs

# Build dependencies
RUN cargo build

# Now copy the source files and overwrite the dummy main.rs
COPY server/src ./src
COPY server/config ./config

# Final build
RUN cargo build --release

# Stage 2: Prepare the runtime environment
FROM ubuntu:24.10

WORKDIR /usr/local/bin

# Copy the built binary from the builder stage
COPY --from=builder /usr/src/app/target/release/server_bin .

# Copy the config files into the final image
COPY --from=builder /usr/src/app/config ./config

# Create a non-root user
RUN useradd -m appuser
USER appuser

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl --fail http://localhost:9000/ || exit 1

# Set the command to run the binary
CMD ["./server_bin"]
