#!/bin/bash

# =============================================================================
# WHISPER MODEL DOWNLOAD
# =============================================================================

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

# Download Whisper model (optional, will download on first use)
download_model() {
    print_status "Pre-downloading Whisper model (optional but recommended)..."
    read -p "Do you want to pre-download the Whisper model now? This will save time on first transcription. (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        print_status "Attempting to download Whisper model..."
        # Activate virtual environment before running the download script
        source "$VENV_NAME/bin/activate"
        # Run the Python download script
        if python3 download_model.py; then
            print_success "Whisper model downloaded successfully"
            return 0
        else
            print_warning "Model download failed"
            print_status "Don't worry - the model will be downloaded automatically on first transcription"
            print_status "You can also try downloading manually later or check your network connection"
            return 1
        fi
    else
        print_status "Skipping model download. It will be downloaded on first use."
        return 0
    fi
}

# Main function to handle model download
main() {
    download_model
    return 0
}

# Run download if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi