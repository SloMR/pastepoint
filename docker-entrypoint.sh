#!/usr/bin/env sh
set -eu

envsubst "\$SERVER_NAME \$SSL_CERT_PATH \$SSL_CERT_KEY_PATH" < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
echo "Starting Nginx..."

exec "$@"
