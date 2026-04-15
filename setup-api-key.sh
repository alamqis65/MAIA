#!/bin/bash

# Setup API Key Script for SOAPI Transcriber System
# This script helps users set up their Google AI API key

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

print_header "🔑 GOOGLE AI API KEY SETUP"

echo "This script will help you set up your Google AI API key for the Composer service."
echo

# Check current API key
COMPOSER_ENV="/Users/bennychandra/asclepius/medinfras.ai/services/composer/.env"
CURRENT_KEY=$(grep "GEMINI_API_KEY=" "$COMPOSER_ENV" | cut -d'=' -f2)

if [ "$CURRENT_KEY" = "YOUR_ACTUAL_GEMINI_API_KEY_HERE" ] || [ -z "$CURRENT_KEY" ]; then
    print_warning "No valid API key found in composer .env file"
else
    print_status "Current API key: ${CURRENT_KEY:0:10}..."
    echo
    read -p "Do you want to update your API key? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Keeping existing API key"
        exit 0
    fi
fi

echo
print_status "To get your Google AI API key:"
echo -e "  ${CYAN}1.${NC} Visit: https://aistudio.google.com/app/apikey"
echo -e "  ${CYAN}2.${NC} Sign in with your Google account"
echo -e "  ${CYAN}3.${NC} Click 'Create API Key'"
echo -e "  ${CYAN}4.${NC} Copy the generated API key"
echo

# Get API key from user
while true; do
    read -p "Enter your Google AI API key: " API_KEY
    
    if [ -z "$API_KEY" ]; then
        print_error "API key cannot be empty"
        continue
    fi
    
    if [ ${#API_KEY} -lt 30 ]; then
        print_error "API key seems too short (should be ~40 characters)"
        continue
    fi
    
    if [[ ! $API_KEY =~ ^AIza[A-Za-z0-9_-]+$ ]]; then
        print_error "API key format doesn't match expected pattern (should start with 'AIza')"
        continue
    fi
    
    break
done

# Update the .env file
print_status "Updating composer .env file..."

# Create backup
cp "$COMPOSER_ENV" "${COMPOSER_ENV}.backup.$(date +%s)"

# Update the API key
sed -i.tmp "s/GEMINI_API_KEY=.*/GEMINI_API_KEY=$API_KEY/" "$COMPOSER_ENV"
rm "${COMPOSER_ENV}.tmp"

print_success "API key updated successfully!"

# Test the API key
print_status "Testing API key..."
cd "/Users/bennychandra/asclepius/medinfras.ai/services/composer"

# Simple test using curl
TEST_RESULT=$(curl -s -w "%{http_code}" -o /dev/null \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=$API_KEY")

if [ "$TEST_RESULT" = "200" ]; then
    print_success "✅ API key is valid and working!"
else
    print_error "❌ API key test failed (HTTP $TEST_RESULT)"
    print_error "Please verify your API key is correct"
fi

echo
print_header "🚀 NEXT STEPS"
echo -e "1. ${CYAN}Restart your services:${NC} ./stop_services.sh && ./start_services.sh"
echo -e "2. ${CYAN}Test the composer:${NC} curl http://localhost:4020/healthz"
echo -e "3. ${CYAN}Check logs:${NC} The composer service should now start without API key errors"

print_success "Setup complete!"