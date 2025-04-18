#!/bin/bash

# Get the project root directory (one level up from scripts)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Function to validate IP address format
validate_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        return 0
    else
        return 1
    fi
}

# Function to update file content
update_file() {
    local file=$1
    local old_value=$2
    local new_value=$3

    if [ ! -f "$file" ]; then
        echo "Error: Required file not found: $file"
        exit 1
    fi

    if ! sed -i "s|$old_value|$new_value|g" "$file"; then
        echo "Error: Failed to update $file"
        exit 1
    fi

    echo "Updated $file"
}

# Get local IP address
echo "Please enter your local IP address (e.g., 192.168.1.100):"
read -r local_ip

# Validate IP address
while ! validate_ip "$local_ip"; do
    echo "Invalid IP address format. Please enter a valid IP address:"
    read -r local_ip
done

# Update .env.development
update_file "$PROJECT_ROOT/.env.development" "SERVER_NAME=127.0.0.1" "SERVER_NAME=$local_ip"
update_file "$PROJECT_ROOT/.env.development" "HOST=127.0.0.1" "HOST=0.0.0.0"

# Update client environment
update_file "$PROJECT_ROOT/client/src/environments/environment.ts" "apiUrl: '127.0.0.1:9000'" "apiUrl: '$local_ip:9000'"

# Update server configurations
update_file "$PROJECT_ROOT/server/config/development.toml" "cors_allowed_origins = \"https://127.0.0.1\"" "cors_allowed_origins = \"https://$local_ip\""
update_file "$PROJECT_ROOT/server/config/docker-dev.toml" "cors_allowed_origins = \"https://127.0.0.1\"" "cors_allowed_origins = \"https://$local_ip\""

echo "Network configuration completed successfully!"
echo "Your local IP address ($local_ip) has been set in all configuration files."
echo "You can now run 'docker compose up --build' to start the application."
