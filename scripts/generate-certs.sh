#!/bin/sh
set -e

CERT_DIR="../certs"
mkdir -p $CERT_DIR

# Generate proper CA-signed cert (example for Let's Encrypt)
# Replace with your actual certbot command in production
openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
    -keyout $CERT_DIR/key.pem \
    -out $CERT_DIR/cert.pem \
    -subj "/C=US/ST=State/L=City/O=Company/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:localhost"

# Set secure permissions
OWNER_USER="${USER:-$(id -un)}"
OWNER_GROUP="$(id -gn "$OWNER_USER" 2>/dev/null || id -gn)"

chown "$OWNER_USER:$OWNER_GROUP" "$CERT_DIR/key.pem" "$CERT_DIR/cert.pem"

# Secure permissions: private key should not be world-readable
chmod 600 "$CERT_DIR/key.pem"
chmod 644 "$CERT_DIR/cert.pem"
