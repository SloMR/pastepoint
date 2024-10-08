# Stage 1: Build the Rust app
FROM rust:latest AS builder

WORKDIR /usr/src/app

# Copy the Cargo.toml and Cargo.lock files
COPY server/Cargo.toml ./Cargo.lock ./
COPY ../rust-toolchain rust-toolchain

# Create an empty main.rs to allow cargo to build dependencies
RUN mkdir -p src && echo "fn main() {}" > src/main.rs

# Build dependencies
RUN cargo build --release

# Now copy the source files and overwrite the dummy main.rs
COPY server/src ./src

# Final build
RUN cargo build --release

# Stage 2: Prepare the runtime environment
FROM ubuntu:24.10

# Copy the built binary from the builder stage
COPY --from=builder /usr/src/app/target/release/server /usr/local/bin/server

# Set the command to run the binary
CMD ["/usr/local/bin/server"]
