#!/bin/sh

# Define certificate paths
CERT_DIR="/etc/ssl/certs"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

# Create the certificate directory if it doesn't exist
mkdir -p $CERT_DIR

# Generate self-signed certificates
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout $KEY_FILE \
    -out $CERT_FILE \
    -subj "/C=US/ST=Some-State/O=Internet Widgits Pty Ltd/CN=localhost"

# Set permissions so that the server can read the private key
chmod 644 $KEY_FILE $CERT_FILE