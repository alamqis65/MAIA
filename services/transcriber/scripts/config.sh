#!/bin/bash

# =============================================================================
# TRANSCRIBER SERVICE CONFIGURATION
# =============================================================================

# Service Configuration
VENV_NAME="venv"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Handle script interruption
cleanup() {
    echo
    print_status "🛑 Shutting down service..."
    print_success "Service stopped. Virtual environment is still active."
    print_status "To deactivate virtual environment, run: deactivate"
}

# Check if Python is installed
check_python() {
    print_status "Checking Python installation..."
    if ! command -v python3 &> /dev/null; then
        print_error "Python3 is not installed. Please install Python 3.8+ first."
        return 1
    fi

    PYTHON_VERSION=$(python --version | cut -d' ' -f2)
    print_success "Python ${PYTHON_VERSION} found"
    return 0
}

# Check if FFmpeg is installed (required for whisper)
check_ffmpeg() {
    print_status "Checking FFmpeg installation..."
    if ! command -v ffmpeg &> /dev/null; then
        print_error "FFmpeg is not installed. FFmpeg is required for Whisper, please install it first."
        print_error "To install on macOS, you can use Homebrew: brew install ffmpeg"
        print_error "To install on Linux, use your package manager, e.g., apt-get install ffmpeg"
        print_error "To install on other systems, visit: https://ffmpeg.org/download.html"
        return 1
    else
        print_success "FFmpeg found"
        return 0
    fi
}