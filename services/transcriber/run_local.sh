#!/bin/bash

# Transcriber Service Local Development Script
# This script automates the setup and running of the transcriber service

set -e  # Exit on any error

# =============================================================================
# LOAD CONFIGURATION AND UTILITIES
# =============================================================================

# Source utilities (which includes config.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts"
source "${SCRIPT_DIR}/config.sh"

# =============================================================================
# MAIN EXECUTION WORKFLOW
# =============================================================================

# Main execution function
main() {
    echo "📁 Current directory: $(pwd)"
    echo

    # Check system prerequisites
    print_status "🔍 Checking system prerequisites..."
    "${SCRIPT_DIR}/check_prerequisites.sh" || exit 1

    # Setup environment
    print_status "⚙️  Setting up environment..."

    "${SCRIPT_DIR}/setup_environment.sh" || exit 1

    # Pre-flight checks
    print_status "🛫 Running pre-flight checks..."
    "${SCRIPT_DIR}/check_preflight.sh"

    # Optional model download
    print_status "📥 Optional model download..."
    "${SCRIPT_DIR}/download_model.sh"

    echo
    print_success "✅ Setup completed successfully!"
    echo

    # Start the service
    print_status "🚀 Starting the transcriber service..."
    exec "./start.sh"
}

# Handle script interruption
trap cleanup INT TERM

# =============================================================================
# SCRIPT START
# =============================================================================
echo "🚀 Starting Transcriber Service Local Development Setup..."
main "$@"