#!/bin/bash

# =============================================================================
# ENVIRONMENT SETUP
# =============================================================================

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

# Create and activate virtual environment for Python dependencies
setup_venv() {
    print_status "Setting up virtual environment..."
    if [ -d "$VENV_NAME" ]; then
        print_warning "Virtual environment already exists. Removing old one..."
        rm -rf "$VENV_NAME"
    fi
    python -m venv "$VENV_NAME"
    source "$VENV_NAME/Scripts/activate"
    # Upgrade pip
    pip install --upgrade pip
    print_success "Virtual environment created and activated"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies from requirements.txt..."
    if [ ! -f "requirements.txt" ]; then
        print_error "requirements.txt not found in current directory"
        return 1
    fi
    pip install -r requirements.txt
    print_success "Dependencies installed successfully"
}

# Create .env file if it doesn't exist
setup_env_file() {
    print_status "Setting up environment configuration..."
    if [ ! -f ".env" ]; then
        print_warning ".env file not found. Creating default configuration..."
        cat > .env << EOF
# Transcriber Service Configuration
WHISPER_MODEL=small
WHISPER_CACHE_DIR=./cache/whisper
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBITMQ_EXCHANGE_NAME=asc.soapi
RABBITMQ_QUEUE=transcription_results

# Optional: Uncomment and modify as needed
# OPENAI_API_KEY=your_openai_api_key_here
EOF
        print_success "Default .env file created. You can modify it as needed."
    else
        print_success "Existing .env file found"
    fi
}

# Main function to setup environment
main() {
    setup_venv || return 1
    install_dependencies || return 1
    setup_env_file || return 1
    return 0
}

# Run setup if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi