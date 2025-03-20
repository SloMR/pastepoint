# Simple makefile for managing Docker Compose environments
# Usage: make prod | make dev | make down

.PHONY: dev prod down logs certs

# Production environment (default)
prod:
	@echo "Starting production environment..."
	docker compose up -d
	@echo "Production services are starting. View logs with: make logs"

# Development environment
dev:
	@echo "Starting development environment..."
	docker compose --env-file .env.development up --build -d
	@echo "Development services are starting. View logs with: make logs"

# Stop all containers
down:
	@echo "Stopping all services..."
	docker compose down

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
	@echo "make down    - Stop all services"
	@echo "make logs    - View logs"
	@echo "make certs   - Generate self-signed certificates"
	@echo "make help    - Show this help message"

# Default target
.DEFAULT_GOAL := prod
