# Simple makefile for managing Docker Compose environments
# Usage: make prod | make dev | make down

.PHONY: dev prod down stop logs certs

# Production environment (default)
prod:
	@echo "Starting production environment..."
	docker compose up --build --force-recreate -d
	@echo "Production services are starting. View logs with: make logs"

# Development environment
dev:
	@echo "Starting development environment..."
	docker compose --env-file .env.development up --build --force-recreate -d
	@echo "Development services are starting. View logs with: make logs"

# Stop and remove PastePoint containers
down:
	@echo "Stopping and removing PastePoint services..."
	docker compose down

# Stop PastePoint containers without removing them
stop:
	@echo "Stopping PastePoint services..."
	docker compose stop

# View logs
logs:
	@echo "Viewing logs (Ctrl+C to exit)..."
	docker compose logs -f

# Generate certificates (if needed)
certs:
	@echo "Generating self-signed certificates..."
	mkdir -p certs
	./scripts/generate-certs.sh
	@echo "Certificates generated in ./certs directory"

# Show help
help:
	@echo "PastePoint Docker Compose Management"
	@echo "-----------------------------------"
	@echo "make dev     - Start development environment"
	@echo "make prod    - Start production environment"
	@echo "make down    - Stop and remove PastePoint services"
	@echo "make stop    - Stop PastePoint services (without removing)"
	@echo "make logs    - View logs"
	@echo "make certs   - Generate self-signed certificates"
	@echo "make help    - Show this help message"

# Default target
.DEFAULT_GOAL := prod
