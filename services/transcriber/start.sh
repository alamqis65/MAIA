#!/bin/bash

# Quick Start Script for Transcriber Service
# Use this after initial setup with run_local.sh

set -e

SERVICE_PORT=4010
SERVICE_HOST="0.0.0.0"

# Source configuration file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts"
source "${SCRIPT_DIR}/config.sh"

# Print a status message with a blue [INFO] prefix
# Usage: print_status "<message>"
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

echo "🚀 Quick Start - Transcriber Service"

# Check if virtual environment exists
if [ ! -d "$VENV_NAME" ]; then
    echo "❌ Virtual environment not found. Please run ./run_local.sh first for initial setup."
    exit 1
fi

print_status "Activating virtual environment..."
source "$VENV_NAME/Scripts/activate"

print_status "Starting transcriber service..."
print_success "Service available at: http://${SERVICE_HOST}:${SERVICE_PORT}"
print_success "API docs at: http://${SERVICE_HOST}:${SERVICE_PORT}/docs"

echo "Press Ctrl+C to stop the service"
echo

uvicorn main:app --host "$SERVICE_HOST" --port "$SERVICE_PORT" --no-access-log --workers 1 #--reload