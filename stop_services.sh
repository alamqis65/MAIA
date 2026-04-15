#!/bin/bash

# Stop All Services Script
# This script stops all services started by start_services.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Port configurations
TRANSCRIBER_PORT=4010
COMPOSER_PORT=4020
GATEWAY_PORT=4000
WEB_PORT=3000
RABBITMQ_MGMT_PORT=15672

echo "🛑 Stopping SOAPI Transcriber System Services..."

# Function to kill processes on a specific port
kill_port() {
    local port=$1
    local service_name=$2
    
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        print_status "Stopping $service_name on port $port..."
        echo $pids | xargs kill -TERM 2>/dev/null || true
        sleep 2
        
        # Force kill if still running
        local remaining_pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$remaining_pids" ]; then
            print_warning "Force killing $service_name..."
            echo $remaining_pids | xargs kill -9 2>/dev/null || true
        fi
        print_success "$service_name stopped"
    else
        print_status "$service_name was not running on port $port"
    fi
}

# Stop all services
kill_port $WEB_PORT "Web Application"
kill_port $GATEWAY_PORT "Gateway Service"  
kill_port $COMPOSER_PORT "Composer Service"
kill_port $TRANSCRIBER_PORT "Transcriber Service"

# Stop RabbitMQ Docker container
print_status "Stopping RabbitMQ container..."
if docker ps -q -f name=rabbitmq-soapi | grep -q .; then
    docker stop rabbitmq-soapi >/dev/null 2>&1
    docker rm rabbitmq-soapi >/dev/null 2>&1
    print_success "RabbitMQ container stopped and removed"
else
    print_status "RabbitMQ container was not running"
fi

# Kill any remaining node/python processes related to our services
print_status "Cleaning up any remaining processes..."
pkill -f "tsx watch src/index.ts" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "uvicorn main:app" 2>/dev/null || true

print_success "✅ All services stopped successfully!"