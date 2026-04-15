#!/bin/bash

# Diagnostic Script for SOAPI Transcriber System
# This script helps troubleshoot common issues

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${PURPLE}================================${NC}"
    echo -e "${PURPLE}$1${NC}"
    echo -e "${PURPLE}================================${NC}"
}

print_status() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_service() {
    local service_name=$1
    local url=$2
    
    if curl -s "$url" >/dev/null 2>&1; then
        print_success "$service_name is responding"
    else
        print_error "$service_name is not responding at $url"
        return 1
    fi
}

check_port() {
    local port=$1
    local service_name=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_success "$service_name is listening on port $port"
    else
        print_error "$service_name is not listening on port $port"
        return 1
    fi
}

print_header "🔍 SOAPI SYSTEM DIAGNOSTICS"

echo "Running comprehensive system checks..."
echo

# Check prerequisites
print_header "PREREQUISITES"
print_status "Checking system requirements..."

# Check Node.js
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    print_success "Node.js: $NODE_VERSION"
else
    print_error "Node.js not found"
fi

# Check Python
if command -v python3 >/dev/null 2>&1; then
    PYTHON_VERSION=$(python3 --version)
    print_success "Python: $PYTHON_VERSION"
else
    print_error "Python3 not found"
fi

# Check Docker
if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
        DOCKER_VERSION=$(docker --version)
        print_success "Docker: $DOCKER_VERSION (running)"
    else
        print_warning "Docker installed but not running"
    fi
else
    print_error "Docker not found"
fi

# Check FFmpeg
if command -v ffmpeg >/dev/null 2>&1; then
    FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -n1 | cut -d' ' -f3)
    print_success "FFmpeg: version $FFMPEG_VERSION"
else
    print_error "FFmpeg not found"
fi

echo

# Check ports
print_header "PORT USAGE"
check_port 3000 "Web Application"
check_port 4000 "Gateway Service"
check_port 4010 "Transcriber Service"
check_port 4020 "Composer Service"
check_port 5672 "RabbitMQ AMQP"
check_port 15672 "RabbitMQ Management"

echo

# Check services
print_header "SERVICE HEALTH"
check_service "Web Application" "http://localhost:3000"
check_service "Gateway Service" "http://localhost:4000/healthz"
check_service "Transcriber Service" "http://localhost:4010/docs"
check_service "Composer Service" "http://localhost:4020/healthz"
check_service "RabbitMQ Management" "http://localhost:15672"

echo

# Check configuration
print_header "CONFIGURATION"

# Check Gemini API key
COMPOSER_ENV="/Users/bennychandra/asclepius/medinfras.ai/services/composer/.env"
if [ -f "$COMPOSER_ENV" ]; then
    GEMINI_KEY=$(grep "GEMINI_API_KEY=" "$COMPOSER_ENV" 2>/dev/null | cut -d'=' -f2)
    if [ -z "$GEMINI_KEY" ] || [ "$GEMINI_KEY" = "YOUR_ACTUAL_GEMINI_API_KEY_HERE" ]; then
        print_error "Gemini API key not configured"
        echo "  Run: ./setup-api-key.sh"
    else
        print_success "Gemini API key configured (${GEMINI_KEY:0:10}...)"
    fi
else
    print_error "Composer .env file not found"
fi

# Check gateway configuration
GATEWAY_ENV="/Users/bennychandra/asclepius/medinfras.ai/gateway/.env"
if [ -f "$GATEWAY_ENV" ]; then
    TRANSCRIBER_PORT=$(grep "TRANSCRIBER_PORT=" "$GATEWAY_ENV" 2>/dev/null | cut -d'=' -f2)
    COMPOSER_PORT=$(grep "COMPOSER_PORT=" "$GATEWAY_ENV" 2>/dev/null | cut -d'=' -f2)
    
    if [ "$TRANSCRIBER_PORT" = "4010" ]; then
        print_success "Gateway → Transcriber port correctly configured"
    else
        print_error "Gateway → Transcriber port mismatch (expected: 4010, found: $TRANSCRIBER_PORT)"
    fi
    
    if [ "$COMPOSER_PORT" = "4020" ]; then
        print_success "Gateway → Composer port correctly configured"
    else
        print_error "Gateway → Composer port mismatch (expected: 4020, found: $COMPOSER_PORT)"
    fi
else
    print_error "Gateway .env file not found"
fi

echo

# Check RabbitMQ
print_header "RABBITMQ"
if docker ps --format "table {{.Names}}" 2>/dev/null | grep -q "rabbitmq"; then
    print_success "RabbitMQ container is running"
    
    # Check RabbitMQ queues (if accessible)
    if command -v rabbitmqctl >/dev/null 2>&1; then
        QUEUES=$(docker exec $(docker ps -qf "name=rabbitmq") rabbitmqctl list_queues 2>/dev/null || echo "")
        if [ -n "$QUEUES" ]; then
            print_success "RabbitMQ queues accessible"
        else
            print_warning "Could not access RabbitMQ queues"
        fi
    fi
else
    print_error "RabbitMQ container not running"
fi

echo

# Check recent logs for errors
print_header "RECENT ERRORS"
print_status "Checking for common error patterns..."

# Check if any services have crashed recently
CRASHED_PROCESSES=$(ps aux | grep -E "(uvicorn|tsx|next)" | grep -v grep | wc -l)
print_status "Active service processes: $CRASHED_PROCESSES"

# Check for specific error patterns in system logs (if accessible)
if [ -f "/var/log/system.log" ] 2>/dev/null; then
    RECENT_ERRORS=$(tail -100 /var/log/system.log 2>/dev/null | grep -i error | wc -l)
    if [ "$RECENT_ERRORS" -gt 0 ]; then
        print_warning "Found $RECENT_ERRORS recent error entries in system log"
    fi
fi

echo

# Provide recommendations
print_header "📋 RECOMMENDATIONS"

echo -e "${CYAN}If services are not running:${NC}"
echo "  ./start_services.sh"
echo
echo -e "${CYAN}If API key issues:${NC}"
echo "  ./setup-api-key.sh"
echo
echo -e "${CYAN}If port conflicts:${NC}"
echo "  ./stop_services.sh"
echo "  Wait 10 seconds, then:"
echo "  ./start_services.sh"
echo
echo -e "${CYAN}If RabbitMQ issues:${NC}"
echo "  docker stop rabbitmq-soapi"
echo "  docker rm rabbitmq-soapi"
echo "  ./start_services.sh"
echo
echo -e "${CYAN}For detailed logs:${NC}"
echo "  Check individual service terminals"
echo "  Or run services individually to see specific errors"

echo
print_success "Diagnostic complete!"