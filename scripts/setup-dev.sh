#!/bin/bash
set -e

echo "=== WeKruit Valet Dev Setup ==="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: node is required but not installed."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm is required but not installed."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Error: docker is required but not installed."; exit 1; }

echo "Installing dependencies..."
pnpm install

echo "Copying .env.example to .env if not present..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example -- please review and update values."
fi

echo "Starting infrastructure..."
docker compose -f docker/docker-compose.yml up -d

echo "Waiting for services to be ready..."
./scripts/health-check.sh --wait

echo "Running migrations..."
pnpm --filter @valet/db db:migrate

echo "Seeding database..."
pnpm --filter @valet/db db:seed

echo ""
echo "=== Setup complete! ==="
echo "Run 'pnpm dev' to start all apps."
