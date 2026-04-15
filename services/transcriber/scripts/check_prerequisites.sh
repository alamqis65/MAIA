#!/bin/bash

# =============================================================================
# SYSTEM PREREQUISITES CHECK
# =============================================================================

# Source utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

# Main function to run all checks
main() {
    local exit_code=0

    check_python || exit_code=1
    check_ffmpeg || exit_code=1

    return $exit_code
}

# Run checks if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi