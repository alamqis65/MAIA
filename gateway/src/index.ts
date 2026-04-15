import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import fetch from "node-fetch";

// Load environment variables with support for .env.<NODE_ENV> and .env.production
const envName = (process.env.NODE_ENV || "development").trim();
const cwd = process.cwd();
const envSpecificPath = envName === "development"
  ? path.join(cwd, ".env")
  : path.join(cwd, `.env.${envName}`);

if (fs.existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath });
} else if (fs.existsSync(path.join(cwd, ".env"))) {
  dotenv.config({ path: path.join(cwd, ".env") });
} else {
  dotenv.config();
}

// Utility: simple timeout for fetch via AbortController
function fetchWithTimeout(url: string, init: any = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

// Configuration from environment variables
const allowedMorganFormats = [
  "combined",
  "common",
  "dev",
  "short",
  "tiny",
] as const;
type MorganFormat = typeof allowedMorganFormats[number];

const parseOrigins = (): string | string[] => {
  const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.trim() : "*";
  if (corsOrigin.includes(",")) {
    return corsOrigin
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  }
  return corsOrigin;
};

const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  cors: {
    origin: parseOrigins(),
    credentials: process.env.CORS_CREDENTIALS === "true",
  },
  requestSizeLimit: process.env.REQUEST_SIZE_LIMIT || "25mb",
  transcriberUrl: `http://${process.env.TRANSCRIBER_HOST || 'localhost'}:${process.env.TRANSCRIBER_PORT || '4010'}`,
  composerUrl: `http://${process.env.COMPOSER_HOST || 'localhost'}:${process.env.COMPOSER_PORT || '4020'}`,
  logLevel: (allowedMorganFormats.includes((process.env.LOG_LEVEL || "tiny") as MorganFormat)
    ? (process.env.LOG_LEVEL || "tiny")
    : "tiny") as MorganFormat,
  fetchTimeoutMs: parseInt(process.env.FETCH_TIMEOUT_MS || "10000", 10),
};

const app = express();

// CORS: if credentials=true and origin="*", browsers will block; adjust safely
let corsOptions: cors.CorsOptions = {};
if (Array.isArray(config.cors.origin)) {
  const allowlist = new Set(config.cors.origin);
  corsOptions = {
    origin: (origin, callback) => {
      if (!origin) return callback(null, false);
      if (allowlist.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: config.cors.credentials,
  };
} else if (config.cors.origin === "*") {
  corsOptions = {
    origin: "*",
    credentials: false, // avoid invalid wildcard+credentials combo
  };
} else {
  corsOptions = {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  };
}
app.use(cors(corsOptions));
app.use(express.json({ limit: config.requestSizeLimit }));
app.use(morgan(config.logLevel));

// Optionally trust proxy if behind load balancer
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

// Health check: includes upstream services with timeouts
app.get("/health", async (_req, res) => {
  const result: any = { ok: true, nodeEnv: config.nodeEnv };
  try {
    const [composerResp, transcriberResp] = await Promise.allSettled([
      fetchWithTimeout(`${config.composerUrl}/health`, { method: "GET" }, config.fetchTimeoutMs),
      fetchWithTimeout(`${config.transcriberUrl}/transcriber/health`, { method: "GET" }, config.fetchTimeoutMs),
    ]);

    const parseStatus = (s: PromiseSettledResult<any>) => {
      if (s.status === "fulfilled") {
        return { reachable: true, status: s.value.status };
      }
      return { reachable: false, error: String(s.reason) };
    };

    result.services = {
      composer: parseStatus(composerResp),
      transcriber: parseStatus(transcriberResp),
    };
  } catch (e) {
    result.ok = false;
    result.error = "health probe error";
  }
  res.json(result);
});

// Pass-through compose (transcript → SOAPI)
app.post("/pipeline/soapi", async (req, res) => {
  try {
    const r = await fetchWithTimeout(`${config.composerUrl}/compose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body),
    }, config.fetchTimeoutMs);

    const contentType = r.headers.get("content-type") || "";
    let body: any;
    if (contentType.includes("application/json")) {
      body = await r.json().catch(() => ({ error: "invalid json from upstream" }));
    } else {
      body = await r.text().catch(() => "");
    }

    if (contentType.includes("application/json")) {
      res.status(r.status).json(body);
    } else {
      res.status(r.status).send(body);
    }
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    res.status(502).json({ error: isAbort ? "upstream timeout" : "upstream error", details: String(err?.message || err) });
  }
});

// Convenience endpoint to call transcriber HTTP
app.post("/transcribe", async (_req, res) => {
  res.status(400).json({ error: "Use POST /transcriber/transcribe (multipart/form-data), or send transcribe using the UI." });
});

const server = app.listen(config.port, () => {
  console.log(`Configuration: ${JSON.stringify({
    port: config.port,
    nodeEnv: config.nodeEnv,
    cors: config.cors,
    requestSizeLimit: config.requestSizeLimit,
    fetchTimeoutMs: config.fetchTimeoutMs,
  }, null, 2)}\n`);
  console.log(`Gateway: http://localhost:${config.port}`);
  console.log(`Healthcheck: http://localhost:${config.port}/health\n`);
  console.log(`Transcriber URL: ${config.transcriberUrl}`);
  console.log(`Composer URL: ${config.composerUrl}`);
  console.log(`\nEnvironment: ${config.nodeEnv}`);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`${signal} received: closing server...`);
  server.close((err?: Error) => {
    if (err) {
      console.error('Error during server close', err);
      process.exit(1);
    }
    console.log('Server closed. Bye!');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
