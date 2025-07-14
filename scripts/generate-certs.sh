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
chown "$USER":"$USER" $CERT_DIR/key.pem
chmod 644 $CERT_DIR/key.pem
chmod 644 $CERT_DIR/cert.pem
