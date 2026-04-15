#!/bin/bash

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

# Check if port is available
check_port() {
    print_status "Checking if port ${SERVICE_PORT} is available..."
    if lsof -Pi :${SERVICE_PORT} -sTCP:LISTEN -t >/dev/null; then
        print_warning "Port ${SERVICE_PORT} is already in use. Attempting to find the process..."
        PROCESS=$(lsof -Pi :${SERVICE_PORT} -sTCP:LISTEN -t)
        print_warning "Process using port ${SERVICE_PORT}: ${PROCESS}"
        print_warning "You may need to stop the existing service or use a different port."
        read -p "Do you want to kill the existing process? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill -9 $PROCESS
            print_success "Process killed successfully"
        else
            print_warning "Continuing anyway. The service may fail to start."
        fi
    else
        print_success "Port ${SERVICE_PORT} is available"
    fi
}

# Main function to run pre-flight checks
main() {
    check_port
    return 0
}

# Run checks if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi