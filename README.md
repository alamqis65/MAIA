# SOAPI-Whisper-Gemini
Audio transcription (Whisper) → SOAPI format (Gemini) with RabbitMQ event bus.

## Overview

### Web Frontend
- Next.js app for audio upload & SOAPI display.
- Calls Gateway API to initiate transcription.
- Receives SOAPI JSON response.

### Gateway
- Node.js/Express API server.
- Accepts audio upload, stores file, and calls Transcriber service.
- Receives transcription result, forwards to Composer service.
- Returns SOAPI JSON to Web frontend.
- Uses RabbitMQ for async communication between services.
- Validates SOAPI JSON with Ajv.
- Environment variables for configuration (e.g., Gemini API key).
- Dockerized for easy deployment.

### Transcriber Service
- Python FastAPI service using OpenAI Whisper for transcription.
- Accepts audio file path, returns transcript and segments.
- Publishes `transcript.ready` event to RabbitMQ.
- Dockerized for easy deployment.

### Composer Service
- Node.js/Express service that converts transcript to SOAPI format using Gemini API.
- Consumes `transcript.ready` event from RabbitMQ, calls Gemini API, and publishes `soapi.ready` event.
- Dockerized for easy deployment.   

### RabbitMQ Message Queue 
- Facilitates async communication between Gateway, Transcriber, and Composer.
- Uses topic exchange for routing messages based on keys.

## System Flow Diagram

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│             │    │             │    │             │
│  Web App    │    │   Gateway   │    │ Transcriber │
│ (Next.js)   │    │ (Express)   │    │  (FastAPI)  │
│  Port 3000  │    │  Port 4000  │    │  Port 4010  │
│             │    │             │    │             │
└─────┬───────┘    └─────┬───────┘    └─────┬───────┘
      │                  │                  │
      │ 1. Upload Audio  │                  │
      ├──────────────────┼──────────────────┤
      │                  │                  │ 2. Transcribe
      │                  │                  │    Audio
      │                  │                  │
      │                  │                  ▼
      │                  │            ┌─────────────┐
      │                  │            │             │
      │ 5. SOAPI Result  │            │  RabbitMQ   │
      │◄─────────────────┤            │ (Message    │
      │                  │            │   Queue)    │
      │                  │            │             │
      │                  │            └─────┬───────┘
      │                  │                  │
      │                  │                  │ 3. transcript.ready
      │                  │                  │
      │                  │                  ▼
      │                  │            ┌─────────────┐
      │                  │            │             │
      │ 4. Compose SOAPI │            │  Composer   │
      │◄─────────────────┤            │  (Gemini)   │
      │                  │            │  Port 4020  │
      │                  │            │             │
      │                  │            └─────────────┘
      │                  │
      └──────────────────┘

Flow:
1. User uploads audio file via Web App
2. Audio sent to Transcriber → Whisper AI processes → generates transcript
3. Transcriber publishes 'transcript.ready' event to RabbitMQ
4. Composer consumes transcript → Gemini AI converts to SOAPI format
5. User can also manually request SOAPI conversion via Gateway
```

## Folder Structure

```
soapi-whisper-gemini/
├─ docker-compose.yml
├─ .env.example
├─ README.md
├─ gateway/
│  ├─ Dockerfile
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ src/
│     └─ index.ts
├─ services/
│  ├─ transcriber/
│  │  ├─ Dockerfile
│  │  ├─ requirements.txt
│  │  └─ main.py
│  └─ composer/
│     ├─ Dockerfile
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts
│        └─ rmq.ts
└─ apps/
   └─ web/
      ├─ Dockerfile
      ├─ package.json
      ├─ next.config.js
      └─ app/
         ├─ layout.tsx
         └─ page.tsx
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+
- Docker and Docker Compose
- FFmpeg (for audio processing)

### Quick Setup

1. **Set up Google AI API Key:**
   ```bash
   ./setup-api-key.sh
   ```
   This will guide you through getting and setting up your Google AI API key.

2. **Start all services:**
   ```bash
   ./start_services.sh
   ```

3. **Access the services:**
   - **Web Application:** http://localhost:3000
   - **Gateway API:** http://localhost:4000/healthz
   - **Transcriber API:** http://localhost:4010/docs
   - **Composer API:** http://localhost:4020/healthz
   - **RabbitMQ Management:** http://localhost:15672 (guest/guest)

4. **Stop all services:**
   ```bash
   ./stop_services.sh
   ```

### Manual Docker Setup (Alternative)
If you prefer Docker:
1) Set up `.env` from `.env.example` (fill in `GEMINI_API_KEY`).
2) `docker compose up --build`

## Demo Flow
- Open Web → select audio file → **Transcribe**.
- Press **Compose SOAPI** → JSON result & display.
- Transcriber also **publishes** `transcript.ready` → Composer **consumes** and publishes `soapi.ready` (check RabbitMQ mgmt → Exchanges/Queues → Messages).

## Routing Keys (topic exchange: `asc.soapi`)
- `transcript.ready` — payload: `{ transcript, segments?, meta }`
- `soapi.ready`      — payload: SOAPI JSON

## Production Notes
- Add authentication (JWT HttpOnly) in gateway/web.
- Ajv schema hardening & structured logging.
- Database persistence (PostgreSQL) for audit & versioning.
- Dead-letter exchange for error events.
