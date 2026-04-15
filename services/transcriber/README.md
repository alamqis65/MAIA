# Transcriber Service - Local Development

This directory contains scripts to automate the setup and running of the transcriber service for local development.

## Quick Start

### First Time Setup

```bash
# Run the complete setup script (only needed once)
./run_local.sh
```

This script will:

-  ✅ Check Python and FFmpeg installation
-  🐍 Create and activate a virtual environment
-  📦 Install all dependencies from requirements.txt
-  ⚙️ Create a default .env configuration file
-  🔍 Check port availability
-  📥 Optionally download the Whisper model
-  🚀 Start the service

### Subsequent Runs

```bash
# Quick start (after initial setup)
./start.sh
```

### Test the Service

```bash
# Test if the service is working
./test_service.sh
```

### Download Whisper Model (Optional)

```bash
# Download model separately (handles SSL issues)
./download_model.sh
```

## Service Endpoints

Once running, the service will be available at:

-  **Service**: http://localhost:7010
-  **API Documentation**: http://localhost:7010/docs
-  **Alternative Docs**: http://localhost:7010/redoc

## Configuration

The service uses a `.env` file for configuration. Key defaults (see full `.env`):

```env
WHISPER_MODEL=small
WHISPER_TEMPERATURE=0.0
WHISPER_TEMPERATURE_INCREMENT=0.2
WHISPER_CACHE_DIR=./cache/whisper
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBITMQ_QUEUE=transcription_results
```

### Temperature & Fallback Strategy

OpenAI Whisper natively supports _temperature fallback_ by accepting a **tuple** of temperatures. During decoding it will try each temperature in order until quality thresholds are satisfied.

To keep the `.env` simple, this service derives that tuple automatically:

-  If both `WHISPER_TEMPERATURE` (base) and `WHISPER_TEMPERATURE_INCREMENT` (inc > 0) are set, it expands to `(base, base+inc, base+2*inc, ...)` up to `1.0`.
-  Example: `0.0` + `0.2` => `(0.0, 0.2, 0.4, 0.6, 0.8, 1.0)`
-  If only `WHISPER_TEMPERATURE` is set (or increment <= 0), a single float is used.
-  If neither is set, Whisper's internal default tuple is used.

Previously an option `temperature_increment_on_fallback` was forwarded (used in other implementations like faster-whisper); that argument is **not** part of the upstream `openai-whisper` `DecodingOptions` and has been removed to avoid runtime errors.

### Pinning Whisper Version

`requirements.txt` now pins `openai-whisper==20231117` for stability. Upstream API changes (especially around decoding options) can otherwise introduce unexpected runtime failures. When upgrading:

1. Change the version constraint.
2. Reinstall deps: (inside venv) `pip install --upgrade --no-cache-dir openai-whisper==<new_version>`
3. Run a short regression transcription to confirm no new warnings/errors.

If a future version adds/removes decoding parameters, the existing expansion logic should remain compatible because it only sets `temperature` and standard documented options.

### Available Whisper Models

-  `tiny` - Fastest, least accurate
-  `base` - Good balance
-  `small` - **Default** - Good accuracy/speed trade-off
-  `medium` - Better accuracy, slower
-  `large` - Best accuracy, slowest

## Usage Examples

### Basic Transcription

```bash
curl -X POST "http://localhost:7010/transcriber/transcribe" \
  -H "Content-Type: multipart/form-data" \
  -F "audio=@your-audio-file.wav" \
  -F "language=id"
```

### Supported Audio Formats

-  WAV, MP3, M4A, FLAC, OGG
-  Any format supported by FFmpeg

### Supported Languages

Use ISO 639-1 language codes:

-  `id` - Indonesian
-  `en` - English
-  `es` - Spanish
-  `fr` - French
-  And many more...

## Development

### Project Structure

```
transcriber/
├── main.py              # FastAPI application
├── router.py            # API routes
├── whisper_service.py   # Whisper transcription logic
├── rabbitmq.py          # Message queue integration
├── config.py            # Configuration management
├── requirements.txt     # Python dependencies
├── Dockerfile          # Docker configuration
├── run_local.sh        # Complete setup script
├── start.sh            # Quick start script
├── test_service.sh     # Service testing script
└── README.md           # This file
```

### Virtual Environment

The scripts create a `venv` directory containing the Python virtual environment. To manually activate:

```bash
source venv/bin/activate  # Activate
deactivate                # Deactivate
```

### Logs and Debugging

-  The service runs with `--reload` flag for automatic reloading during development
-  Check console output for errors and logs
-  Use the `/docs` endpoint to test API endpoints interactively

## Prerequisites

-  **Python 3.8+** - Check with `python3 --version`
-  **FFmpeg** - Will be automatically installed via Homebrew if missing
-  **Homebrew** (macOS) - For installing FFmpeg

## Troubleshooting

### Common Issues

1. **Port already in use**

   -  The setup script will detect and offer to kill existing processes
   -  Or manually: `lsof -ti:7010 | xargs kill -9`

2. **FFmpeg not found**

   -  Install manually: `brew install ffmpeg`

3. **Virtual environment issues**

   -  Delete `venv` folder and re-run `./run_local.sh`

4. **Model download fails (SSL Certificate Error)**

   -  Common in corporate networks or with proxy/firewall
   -  The setup script will automatically try SSL workaround
   -  Or run manually: `./download_model.sh`
   -  **Don't worry**: Service works without pre-download; model downloads on first use

5. **SSL Certificate Verification Error**

   ```
   ssl.SSLCertVerificationError: [SSL: CERTIFICATE_VERIFY_FAILED]
   ```

   -  **Solution 1**: Run `./download_model.sh` (handles SSL issues automatically)
   -  **Solution 2**: Skip pre-download, model will download on first transcription
   -  **Solution 3**: Manual download (see download_model.sh for instructions)

6. **Permission denied on scripts**

   -  Run: `chmod +x *.sh`

7. **Python version compatibility**
   -  Requires Python 3.8+
   -  Check: `python3 --version`

### Getting Help

-  Check the service logs in the terminal
-  Visit http://localhost:7010/docs for API documentation
-  Test with `./test_service.sh`

## Optional: RabbitMQ Setup

For full functionality (message publishing), start RabbitMQ:

```bash
# Using Docker
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Access RabbitMQ Management UI: http://localhost:15672
# Username: guest, Password: guest
```

The service will work without RabbitMQ, but transcription results won't be published to the message queue.
