#!/bin/bash

# Service Status Check Script
# This script checks the status of all services

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "${PURPLE}================================${NC}"
    echo -e "${PURPLE}$1${NC}"
    echo -e "${PURPLE}================================${NC}"
}

print_status() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[RUNNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[DOWN]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[ISSUE]${NC} $1"
}

# Function to check if a service is running on a port
check_service() {
    local port=$1
    local service_name=$2
    local url=$3
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        if [ -n "$url" ]; then
            if curl -s "$url" >/dev/null 2>&1; then
                print_success "$service_name (port $port) - Responding to HTTP"
            else
                print_warning "$service_name (port $port) - Port open but not responding"
            fi
        else
            print_success "$service_name (port $port) - Port is open"
        fi
        return 0
    else
        print_error "$service_name (port $port) - Not running"
        return 1
    fi
}

# Function to check Docker container
check_docker_container() {
    local container_name=$1
    local service_name=$2
    
    if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
        print_success "$service_name - Container running"
        return 0
    elif docker ps -a --format "table {{.Names}}" | grep -q "$container_name"; then
        print_warning "$service_name - Container exists but not running"
        return 1
    else
        print_error "$service_name - Container not found"
        return 1
    fi
}

print_header "🔍 SOAPI TRANSCRIBER SYSTEM STATUS"

echo -e "${CYAN}Checking all services...${NC}"
echo

# Check RabbitMQ
print_status "RabbitMQ Message Queue..."
check_docker_container "rabbitmq-soapi" "RabbitMQ" && \
check_service 5672 "RabbitMQ AMQP" "" && \
check_service 15672 "RabbitMQ Management UI" "http://localhost:15672"

echo

# Check Transcriber Service  
print_status "Transcriber Service (Python/FastAPI)..."
check_service 4010 "Transcriber Service" "http://localhost:4010/docs"

echo

# Check Composer Service
print_status "Composer Service (Node.js/Express)..."
check_service 4020 "Composer Service" "http://localhost:4020/healthz"

echo

# Check Gateway Service
print_status "Gateway Service (Node.js/Express)..."
check_service 4000 "Gateway Service" "http://localhost:4000/healthz"

echo

# Check Web Application
print_status "Web Application (Next.js)..."
check_service 3000 "Web Application" "http://localhost:3000"

echo

# Summary of URLs
print_header "📖 SERVICE URLS"
echo -e "${CYAN}Web Application:${NC}     http://localhost:3000"
echo -e "${CYAN}Gateway API:${NC}         http://localhost:4000"
echo -e "${CYAN}Transcriber API:${NC}     http://localhost:4010/docs"
echo -e "${CYAN}Composer API:${NC}        http://localhost:4020/healthz"
echo -e "${CYAN}RabbitMQ Management:${NC} http://localhost:15672 (guest/guest)"

echo
print_header "🧪 QUICK TESTS"
echo "Test Gateway:     curl http://localhost:4000/healthz"
echo "Test Composer:    curl http://localhost:4020/healthz"
echo "Test Transcriber: curl http://localhost:4010/docs"