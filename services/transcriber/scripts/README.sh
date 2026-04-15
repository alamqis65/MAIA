#!/bin/bash

# =============================================================================
# SCRIPTS OVERVIEW
# =============================================================================

echo "📋 Available Scripts in the scripts/ directory:"
echo
echo "🔧 Core Scripts:"
echo "  • config.sh              - Configuration variables and colors, includes common functions"
echo
echo "🔍 Setup Scripts:"
echo "  • check_prerequisites.sh - Check Python and FFmpeg installations"
echo "  • setup_environment.sh   - Setup virtual environment and dependencies"
echo "  • check_preflight.sh     - Check port availability and other pre-flight checks"
echo "  • download_model.sh      - Download Whisper model (optional)"
echo
echo "🧪 Testing Scripts:"
echo "  • test_service.sh        - Test the transcriber service"
echo
echo "📖 Usage:"
echo "  Run individual scripts:  ./scripts/<script_name>.sh"
echo "  Run full setup:          ./run_local.sh"
echo