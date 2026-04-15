#!/bin/bash

# Test Script for Transcriber Service
# This script tests if the transcriber service is running and responsive

SERVICE_URL="http://localhost:4010"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo "🧪 Testing Transcriber Service"
echo "================================"

# Test 1: Check if service is running
print_status "Checking if service is running..."
if curl -s "${SERVICE_URL}/docs" > /dev/null 2>&1; then
    print_success "Service is running and responsive"
else
    print_error "Service is not running or not responding"
    print_warning "Make sure to start the service first with ./run_local.sh or ./start.sh"
    exit 1
fi

# Test 2: Check health endpoint (if exists)
print_status "Checking root endpoint..."
RESPONSE=$(curl -s "${SERVICE_URL}" 2>/dev/null || echo "")
if [ ! -z "$RESPONSE" ]; then
    print_success "Root endpoint accessible"
    echo "Response: $RESPONSE"
else
    print_warning "Root endpoint not accessible (this may be normal)"
fi

# Test 3: Check OpenAPI docs
print_status "Checking API documentation..."
if curl -s "${SERVICE_URL}/docs" | grep -q "transcriber" 2>/dev/null; then
    print_success "API documentation accessible"
else
    print_warning "API documentation may not contain expected content"
fi

# Test 4: Check transcriber endpoint (without file)
print_status "Checking transcriber endpoint structure..."
TRANSCRIBE_RESPONSE=$(curl -s -X GET "${SERVICE_URL}/transcriber/transcribe" 2>/dev/null || echo "")
if [[ "$TRANSCRIBE_RESPONSE" == *"Method Not Allowed"* ]] || [[ "$TRANSCRIBE_RESPONSE" == *"405"* ]]; then
    print_success "Transcriber endpoint exists (POST method required as expected)"
elif [[ "$TRANSCRIBE_RESPONSE" == *"422"* ]] || [[ "$TRANSCRIBE_RESPONSE" == *"Unprocessable Entity"* ]]; then
    print_success "Transcriber endpoint exists and requires file upload as expected"
else
    print_warning "Transcriber endpoint response: $TRANSCRIBE_RESPONSE"
fi

echo
print_success "✅ Service appears to be working correctly!"
echo
echo "📖 Usage Examples:"
echo "  • API Documentation: ${SERVICE_URL}/docs"
echo "  • Interactive API: ${SERVICE_URL}/redoc"
echo
echo "🎯 Test with an audio file:"
echo "  curl -X POST '${SERVICE_URL}/transcriber/transcribe' \\"
echo "    -H 'Content-Type: multipart/form-data' \\"
echo "    -F 'audio=@your-audio-file.wav' \\"
echo "    -F 'language=id'"