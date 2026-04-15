//import 'dotenv/config';
import fs from "fs";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { Ajv2020 } from "ajv/dist/2020.js";

import { AIConfig } from "./interfaces.js";
import { loadAIConfig } from "./config.js";
import { createLLM } from "./llm/factory.js";

// Load environment variables depending on NODE_ENV
const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const envFile = nodeEnv === "development" ? ".env" : `.env.${nodeEnv}`;
const envPath = path.resolve(process.cwd(), envFile);
console.log(envPath);

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  const defaultEnvPath = path.resolve(process.cwd(), ".env");
  if (envPath !== defaultEnvPath && fs.existsSync(defaultEnvPath)) {
    dotenv.config({ path: defaultEnvPath });
  } else {
    dotenv.config();
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Environment variables for messaging
const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672/";
const EXCHANGE = process.env.RABBITMQ_EXCHANGE || "asc.soapi";
const QUEUE = process.env.RABBITMQ_QUEUE || "transcription_results";

// Load AI configuration (provider agnostic)
console.log(process.env.LLM_PROVIDER);
const aiConfig: AIConfig = loadAIConfig(process.env.LLM_PROVIDER);

// Instantiate provider client
const llm = createLLM(aiConfig);

const soapiSchema = {
  type: "object",
  required: ["patientId", "rawTranscript", "soapi"],
  properties: {
    patientId: { type: "string" },
    displayId: { type: "string" },
    rawTranscript: { type: "string" },
    soapi: {
      type: "object",
      required: [
        "subjective",
        "objective",
        "assessment",
        "plan",
        "intervention",
      ],
      properties: {
        subjective: {},
        objective: {},
        assessment: {},
        plan: {},
        intervention: {},
      },
    },
  },
};

const ajv = new Ajv2020({ strict: false }); // Set strict to false for more flexibility
const validate = ajv.compile(soapiSchema);

function cleanJsonFence(text: string): string {
  // Remove common markdown fences if present
  let cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```javascript\s*/i, "")
    .replace(/^```ts\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return cleaned;
}

function parseStructuredResponse(raw: string): any {
  const cleaned = cleanJsonFence(raw).trim();

  // Fast path
  try {
    return JSON.parse(cleaned);
  } catch {
    // Optional heuristic – keep only if still needed
    const extracted = extractFirstJsonObject(cleaned);
    if (extracted) {
      try {
        return JSON.parse(extracted);
      } catch {
        /* fall through */
      }
    }
    throw new Error("Model output was not valid JSON");
  }
}

/**
 * Attempt to locate the first top-level JSON object within arbitrary text.
 * This is a defensive measure when the LLM prepends prose before the JSON.
 */
function extractFirstJsonObject(text: string): string | null {
  const startIdx = text.indexOf("{");
  if (startIdx === -1) return null;
  let depth = 0;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(startIdx, i + 1);
      }
    }
  }
  return null; // Unbalanced braces
}

async function composeSoapi(input: {
  transcript: string;
  patient?: { displayId?: string };
  language?: string;
}) {
  const { transcript, patient, language = "id" } = input;

  const userPrompt = `

  ${aiConfig.userPrompt}
{
  "displayId": "${patient?.displayId || "Not provided"}",
  "language": "${language}",
  "rawTranscript": ${JSON.stringify(transcript)}
}
`;

  console.log(`-----------------------------------\n`);
  console.log(
    `\ncomposeSoapi(): Using LLM provider=${aiConfig.provider}, model=${aiConfig.model}`
  );
  console.log("User prompt:", userPrompt);
  console.log(`-----------------------------------\n`);

  const raw = await llm.generateJSONResponse({
    systemPrompt: aiConfig.systemPrompt,
    userPrompt,
  });

  let parsed = parseStructuredResponse(raw);
  if (!parsed.soapi) throw new Error("Missing 'soapi' property");

  parsed.patientId ||= patient?.displayId || "UNKNOWN";
  parsed.rawTranscript ||= transcript;

  if (!validate(parsed))
    throw new Error(
      "Schema validation failed: " + ajv.errorsText(validate.errors)
    );

  if (process.env.DEBUG_SOAPI === "1") {
    console.log("AI raw len:", raw.length);
    console.log("Parsed keys:", Object.keys(parsed));
  }
  return parsed;
}

function verifyHmac({
  secret,
  payload,
  signature,
}: {
  secret: string;
  payload: string;
  signature: string;
}) {
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // timing-safe compare (PENTING)
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
}

const api = express.Router();

// HTTP endpoint langsung
api.post("/compose", async (req, res) => {
  try {
    const out = await composeSoapi(req.body);
    //const {id, timestamp } = req.headers ;

    // const out = {
    //   "id": id,
    //   "timestamp": timestamp,
    //   "auth": req.header("authorization")?.split(" ")[1]
    // }
    res.json(out);
  } catch (e: any) {
    console.log(`/compose error:`, e);
    res.status(422).json({ error: e.message });
  }
});

api.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || process.env.COMPOSER_PORT || 4020);

// Log configuration on startup
console.log("AI Configuration:", {
  provider: aiConfig.provider,
  model: aiConfig.model,
  maxTokens: aiConfig.maxTokens,
  contextLength: aiConfig.contextLength,
  temperature: aiConfig.temperature,
  topP: aiConfig.topP,
  topK: aiConfig.topK,
  promptSource: process.env.SYSTEM_PROMPT_FILE ? "file" : "environment/default",
});

// ===== prefix =====
app.use("/v1/composer", api);

app.listen(PORT, () => {
  console.log(`\nComposer HTTP on: ${PORT}`);
  console.log(`Environment: ${nodeEnv}`);
});

