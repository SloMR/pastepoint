#!/bin/bash

# Check if the correct number of arguments is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 new_prod_url"
    exit 1
fi

# Assign the first argument to the new URL variable
NEW_URL=$1
NGINX_CONFIG="../nginx/nginx.conf"
ANGULAR_CONFIG="../client/src/environments/environment.ts"

cp $NGINX_CONFIG "${NGINX_CONFIG}.bak"
cp $ANGULAR_CONFIG "${ANGULAR_CONFIG}.bak"

# Use sed to find and replace the 127.0.0.1 in the config file
sed -i "s|server_name 127.0.0.1;|server_name $NEW_URL;|g" $NGINX_CONFIG
sed -i "s|proxy_pass https://127.0.0.1:9000/ws;|proxy_pass https://$NEW_URL:9000/ws;|g" $NGINX_CONFIG

sed -i "s|apiUrl: '127.0.0.1:9000',|apiUrl: '$NEW_URL:9000',|g" $ANGULAR_CONFIG

echo "127.0.0.1 updated successfully to $NEW_URL in $NGINX_CONFIG and $ANGULAR_CONFIG"
