#!/bin/bash

# Start All Services Script for SOAPI Transcriber System
# This script starts all services in the correct order with proper dependency checks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
ORANGE='\033[38;2;255;128;0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$SCRIPT_DIR"

# Service configurations
TRANSCRIBER_DIR="$WORKSPACE_ROOT/services/transcriber"
COMPOSER_DIR="$WORKSPACE_ROOT/services/composer"
GATEWAY_DIR="$WORKSPACE_ROOT/gateway"
WEB_DIR="$WORKSPACE_ROOT/apps/web"

# Port configurations (from your services)
TRANSCRIBER_PORT=4010
COMPOSER_PORT=4020
GATEWAY_PORT=4000
WEB_PORT=3000
RABBITMQ_PORT=5672
RABBITMQ_MGMT_PORT=15672

# Process tracking
declare -a SERVICE_PIDS=()

print_LF() {
    echo -e ""
}

# Function to print colored output
print_header() {
    echo -e "${ORANGE}=====================================${NC}"
    echo -e "${ORANGE}$1${NC}"
    echo -e "${ORANGE}=====================================${NC}"
}

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

print_service() {
    echo -e "${CYAN}[SERVICE]${NC} $1"
}

# Function to check if a port is available
check_port() {
    local port=$1
    local service_name=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port $port is already in use (needed for $service_name)"
        local process=$(lsof -Pi :$port -sTCP:LISTEN -t)
        print_warning "Process using port $port: $process"
        read -p "Kill existing process and continue? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill -9 $process 2>/dev/null || true
            sleep 1
            print_success "Process killed"
        else
            return 1
        fi
    fi
    return 0
}

# Function to wait for a service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=${3:-30}
    local attempt=1
    
    print_status "Waiting for $service_name to be ready at $url..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            print_success "$service_name is ready!"
            return 0
        fi
        
        if [ $((attempt % 5)) -eq 0 ]; then
            print_status "Still waiting for $service_name... (attempt $attempt/$max_attempts)"
        fi
        
        sleep 1
        attempt=$((attempt + 1))
    done
    
    print_error "$service_name failed to start within $max_attempts seconds"
    return 1
}

# Function to check if RabbitMQ is running
check_rabbitmq() {
    print_status "Checking RabbitMQ..."
    print_LF
    
    if docker ps --format "table {{.Names}}" | grep -q "rabbitmq"; then
        print_success "RabbitMQ container is already running"
        return 0
    fi
    
    # Check if RabbitMQ is installed locally
    if command -v rabbitmq-server >/dev/null 2>&1; then
        print_status "Found local RabbitMQ installation"
        if pgrep -f rabbitmq-server >/dev/null; then
            print_success "RabbitMQ is already running locally"
            return 0
        else
            print_warning "Local RabbitMQ found but not running"
        fi
    fi
    
    return 1
}

# Function to start RabbitMQ
start_rabbitmq() {
    print_service "Starting RabbitMQ with Docker..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        return 1
    fi
    
    # Start RabbitMQ container
    docker run -d \
        --name rabbitmq-soapi \
        -p $RABBITMQ_PORT:5672 \
        -p $RABBITMQ_MGMT_PORT:15672 \
        rabbitmq:3-management \
        >/dev/null 2>&1 || {
        
        # If container already exists, start it
        docker start rabbitmq-soapi >/dev/null 2>&1 || {
            print_error "Failed to start RabbitMQ container"
            return 1
        }
    }
    
    # Wait for RabbitMQ to be ready
    wait_for_service "http://localhost:$RABBITMQ_MGMT_PORT" "RabbitMQ Management UI" 60
    
    print_success "RabbitMQ started successfully"
    print_status "RabbitMQ Management UI: http://localhost:$RABBITMQ_MGMT_PORT (guest/guest)"
}

# Function to start transcriber service
start_transcriber() {
    print_LF
    print_service "Starting Transcriber Service..."
    
    if [ ! -d "$TRANSCRIBER_DIR" ]; then
        print_error "Transcriber directory not found: $TRANSCRIBER_DIR"
        return 1
    fi
    
    cd "$TRANSCRIBER_DIR"
    
    # Check if virtual environment exists and has working Python
    if [ ! -d "venv" ] || [ ! -f "venv/bin/python3" ] || ! ./venv/bin/python3 --version >/dev/null 2>&1; then
        print_status "Setting up transcriber service (virtual environment missing or corrupted)..."
        # Remove corrupted venv if it exists
        [ -d "venv" ] && rm -rf venv
        ./run_local.sh &
    else
        print_status "Using existing virtual environment..."
        # Test if uvicorn works in the venv
        if ./venv/bin/python3 -c "import uvicorn" 2>/dev/null; then
            ./start.sh &
        else
            print_warning "Virtual environment appears corrupted, rebuilding..."
            rm -rf venv
            ./run_local.sh &
        fi
    fi
    
    local pid=$!
    SERVICE_PIDS+=($pid)
    
    cd "$WORKSPACE_ROOT"
    
    # Wait for service to be ready
    wait_for_service "http://localhost:$TRANSCRIBER_PORT/docs" "Transcriber Service" 60
    
    print_success "Transcriber Service started (PID: $pid)"
    print_status "Transcriber API docs: http://localhost:$TRANSCRIBER_PORT/docs"
}

# Function to start composer service
start_composer() {
    print_LF
    print_service "Starting Composer Service..."
    
    if [ ! -d "$COMPOSER_DIR" ]; then
        print_error "Composer directory not found: $COMPOSER_DIR"
        return 1
    fi
    
    cd "$COMPOSER_DIR"
    
    # Check if node_modules exists or package.json is newer
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        print_status "Installing/updating dependencies for composer service..."
        npm install
    fi
    
    # Start the service
    npm run dev &
    local pid=$!
    SERVICE_PIDS+=($pid)
    
    cd "$WORKSPACE_ROOT"
    
    # Wait for service to be ready
    wait_for_service "http://localhost:$COMPOSER_PORT/healthz" "Composer Service"
    
    print_success "Composer Service started (PID: $pid)"
    print_status "Composer Service: http://localhost:$COMPOSER_PORT/healthz"
}

# Function to start gateway service
start_gateway() {
    print_service "Starting Gateway Service..."
    
    if [ ! -d "$GATEWAY_DIR" ]; then
        print_error "Gateway directory not found: $GATEWAY_DIR"
        return 1
    fi
    
    cd "$GATEWAY_DIR"
    
    # Check if node_modules exists or package.json is newer
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        print_status "Installing/updating dependencies for gateway service..."
        npm install
    fi
    
    # Verify critical dependencies are installed
    if [ ! -d "node_modules/dotenv" ]; then
        print_warning "Missing dotenv dependency, installing..."
        npm install
    fi
    
    # Start the service
    npm run dev &
    local pid=$!
    SERVICE_PIDS+=($pid)
    
    cd "$WORKSPACE_ROOT"
    
    # Wait for service to be ready
    wait_for_service "http://localhost:$GATEWAY_PORT/healthz" "Gateway Service"
    
    print_success "Gateway Service started (PID: $pid)"
    print_status "Gateway Service: http://localhost:$GATEWAY_PORT/healthz"
}

# Function to start web application
start_web() {
    print_LF
    print_service "Starting Web Application..."
    
    if [ ! -d "$WEB_DIR" ]; then
        print_error "Web directory not found: $WEB_DIR"
        return 1
    fi
    
    cd "$WEB_DIR"
    
    # Check if node_modules exists or package.json is newer
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        print_status "Installing/updating dependencies for web application..."
        npm install
    fi
    
    # Start the web app
    npm run dev &
    local pid=$!
    SERVICE_PIDS+=($pid)
    
    cd "$WORKSPACE_ROOT"
    
    # Wait for service to be ready
    wait_for_service "http://localhost:$WEB_PORT" "Web Application" 45
    
    print_success "Web Application started (PID: $pid)"
    print_status "Web Application: http://localhost:$WEB_PORT"
}

# Function to check prerequisites
check_prerequisites() {
    print_header "CHECKING PREREQUISITES"

    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        return 1
    fi
    print_success "Node.js found: $(node --version)"
    
    # Check npm
    if ! command -v npm >/dev/null 2>&1; then
        print_error "npm is not installed. Please install npm first."
        return 1
    fi
    print_success "npm found: $(npm --version)"
    
    # Check Python
    if ! command -v python3 >/dev/null 2>&1; then
        print_error "Python3 is not installed. Please install Python 3.8+ first."
        return 1
    fi
    print_success "Python3 found: $(python3 --version)"
    
    # Check Docker (required for RabbitMQ)
    if ! command -v docker >/dev/null 2>&1; then
        print_error "Docker is not installed. Please install Docker first."
        print_error "Visit: https://www.docker.com/get-started"
        return 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker daemon is not running. Please start Docker first."
        print_error "On macOS: Start Docker Desktop application"
        print_error "On Linux: sudo systemctl start docker"
        return 1
    fi
    print_success "Docker found and running: $(docker --version)"
    
    # Check FFmpeg (required for Whisper)
    if ! command -v ffmpeg >/dev/null 2>&1; then
        print_error "FFmpeg is not installed. Please install FFmpeg first."
        print_error "On macOS: brew install ffmpeg"
        print_error "On Ubuntu: sudo apt-get install ffmpeg"
        return 1
    fi
    print_success "FFmpeg found: $(ffmpeg -version | head -n1)"
    
    return 0
}

# Function to check port availability
check_ports() {
    print_LF
    print_header "CHECKING PORT AVAILABILITY"
    
    #check_port $RABBITMQ_PORT "RabbitMQ" || return 1
    #check_port $RABBITMQ_MGMT_PORT "RabbitMQ Management" || return 1
    check_port $TRANSCRIBER_PORT "Transcriber Service" || return 1
    check_port $COMPOSER_PORT "Composer Service" || return 1
    check_port $GATEWAY_PORT "Gateway Service" || return 1
    check_port $WEB_PORT "Web Application" || return 1
    
    print_success "All required ports are available"
}

# Function to display service URLs
display_urls() {
    print_LF
    print_header "🚀 ALL SERVICES STARTED SUCCESSFULLY!"
    echo
    echo -e "${GREEN}Service URLs:${NC}"
    echo -e "  ${CYAN}Web Application:${NC}     http://localhost:$WEB_PORT"
    #echo -e "  ${CYAN}Gateway API:${NC}         http://localhost:$GATEWAY_PORT"
    echo -e "  ${CYAN}Transcriber API:${NC}     http://localhost:$TRANSCRIBER_PORT/docs"
    echo -e "  ${CYAN}Composer API:${NC}        http://localhost:$COMPOSER_PORT/healthz"
    echo -e "  ${CYAN}RabbitMQ Management:${NC} http://localhost:$RABBITMQ_MGMT_PORT (guest/guest)"
    echo
    echo -e "${YELLOW}Health Checks:${NC}"
    #echo -e "  curl http://localhost:$GATEWAY_PORT/health"
    echo -e "  curl http://localhost:$COMPOSER_PORT/health"
    echo -e "  curl http://localhost:$TRANSCRIBER_PORT/health"
    echo -e "  curl http://localhost:$TRANSCRIBER_PORT/docs"
    echo
    echo -e "${BLUE}To stop all services:${NC} Ctrl+C or run ./stop_services.sh"
    echo
}

# Function to cleanup on exit
cleanup() {
    echo
    print_status "🛑 Shutting down services..."
    
    for pid in "${SERVICE_PIDS[@]}"; do
        if kill -0 $pid 2>/dev/null; then
            print_status "Stopping process $pid..."
            kill -TERM $pid 2>/dev/null || true
        fi
    done
    
    # Wait a bit for graceful shutdown
    sleep 2
    
    # Force kill if needed
    for pid in "${SERVICE_PIDS[@]}"; do
        if kill -0 $pid 2>/dev/null; then
            print_status "Force stopping process $pid..."
            kill -9 $pid 2>/dev/null || true
        fi
    done
    
    print_success "All services stopped"
    exit 0
}

# Main execution function
main() {
    echo -e "${ORANGE}🚀 =================================${NC}"
    echo -e "${ORANGE}🚀 STARTING SOAPI TRANSCRIBER SYSTEM${NC}"
    echo -e "${ORANGE}🚀 =================================${NC}"
    print_LF
    
    # Set up signal handlers
    trap cleanup INT TERM
    
    # Check prerequisites
    check_prerequisites || exit 1
    print_LF
    
    # Check port availability
    check_ports || exit 1
    
    # Start services in order
    print_LF
    print_header "STARTING SERVICES"
    
    # 1. Start RabbitMQ first (required by other services)
    if ! check_rabbitmq; then
        start_rabbitmq || exit 1
    else
        print_success "RabbitMQ is already running"
    fi
    
    # 2. Start Transcriber (independent service)
    start_transcriber || exit 1
    
    # 3. Start Composer (consumes from transcriber)
    start_composer || exit 1
    
    # 4. Start Gateway (orchestrates calls)
    # start_gateway || exit 1
    
    # 5. Start Web App (user interface)
    start_web || exit 1
    
    # Display success message and URLs
    display_urls
    
    # Keep script running and wait for user interrupt
    print_status "Press Ctrl+C to stop all services..."
    while true; do
        sleep 1
    done
}

# Run main function
main "$@"