# Gateway Service

A Node.js/Express gateway service that routes requests between the web frontend and backend services.

## Configuration

The gateway service uses environment variables for configuration. Copy `.env.example` to `.env` and modify as needed:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Port number for the gateway server |
| `CORS_ORIGIN` | `*` | CORS origin setting (* or specific URL) |
| `CORS_CREDENTIALS` | `true` | Enable CORS credentials |
| `REQUEST_SIZE_LIMIT` | `25mb` | Maximum request body size |
| `TRANSCRIBER_HOST` | `localhost` | Host/IP address of transcriber service |
| `TRANSCRIBER_PORT` | `4010` | Service port number of transcriber service |
| `COMPOSER_HOST` | `localhost` | Host/IP address of composer service |
| `COMPOSER_PORT` | `4020` | Service port number of composer service |
| `LOG_LEVEL` | `tiny` | Morgan logging level (combined, common, dev, short, tiny) |

## Development

Install dependencies:
```bash
npm install
```

Start the development server:
```bash
npm run dev
```

## Production

Build for production:
```bash
npm run build
```

Start production server:
```bash
npm start
```

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /pipeline/soapi` - Pass-through to composer service
- `POST /transcribe` - Returns error message directing to proper transcription endpoint

## Notes

- All configuration is centralized in the environment variables