import { readFileSync } from "fs";

import { LLMProvider } from "./types.js";
import { AIConfig } from "./interfaces.js";

export const defaultAIConfig: AIConfig = {
  provider: LLMProvider.Ollama,
  model: "models/mistral",
  key: "",
  maxTokens: 4096,
  contextLength: 2048,
  temperature: 0.1,
  systemPrompt: "",
  userPrompt: "",
};

function num(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export function loadAIConfig(llmProvider?: string): AIConfig {
  let aiConfig: AIConfig = { ...defaultAIConfig };

  const provider = (llmProvider || defaultAIConfig.provider).toLowerCase();

  switch (provider) {
    case LLMProvider.Gemini:
      aiConfig.provider = LLMProvider.Gemini;
      aiConfig.model = process.env.GEMINI_MODEL || "models/gemini-2.5-pro";
      aiConfig.key = process.env.GEMINI_API_KEY || "";
      aiConfig.temperature =
        num(process.env.GEMINI_TEMPERATURE) ?? defaultAIConfig.temperature;
      aiConfig.maxTokens =
        num(process.env.GEMINI_MAX_TOKENS) ?? defaultAIConfig.maxTokens;
      aiConfig.topP = num(process.env.GEMINI_TOP_P) ?? defaultAIConfig.topP;
      aiConfig.topK = num(process.env.GEMINI_TOP_K) ?? defaultAIConfig.topK;
      if (!aiConfig.key) {
        console.error(
          "❌ GEMINI_API_KEY is not set or is placeholder. Obtain one at https://aistudio.google.com/app/apikey"
        );
      }
      break;
    case LLMProvider.OpenAI:
      aiConfig.provider = LLMProvider.OpenAI;
      aiConfig.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      aiConfig.key = process.env.OPENAI_API_KEY || "";
      aiConfig.temperature =
        num(process.env.OPENAI_TEMPERATURE) ?? defaultAIConfig.temperature;
      aiConfig.maxTokens =
        num(process.env.OPENAI_MAX_TOKENS) ?? defaultAIConfig.maxTokens;
      aiConfig.topP = num(process.env.OPENAI_TOP_P) ?? defaultAIConfig.topP;
      // OpenAI ignores topK
      if (!aiConfig.key) {
        console.error(
          "❌ OPENAI_API_KEY is not set. Get one from https://platform.openai.com/"
        );
      }
      break;
    case LLMProvider.Groqd:
      aiConfig.provider = LLMProvider.Groqd;
      aiConfig.model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
      aiConfig.key = process.env.GROQ_API_KEY || "";
      aiConfig.temperature =
        num(process.env.GROQ_TEMPERATURE) ?? defaultAIConfig.temperature;
      aiConfig.maxTokens =
        num(process.env.GROQ_MAX_TOKENS) ?? defaultAIConfig.maxTokens;
      aiConfig.topP = num(process.env.GROQ_TOP_P) ?? defaultAIConfig.topP;
      // OpenAI ignores topK
      if (!aiConfig.key) {
        console.error(
          "❌ OPENAI_API_KEY is not set. Get one from https://console.groq.com/keys"
        );
      }
      break;
    case LLMProvider.DeepSeek:
      aiConfig.provider = LLMProvider.DeepSeek;
      aiConfig.model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
      aiConfig.key = process.env.DEEPSEEK_API_KEY || "";
      aiConfig.temperature =
        num(process.env.DEEPSEEK_TEMPERATURE) ?? defaultAIConfig.temperature;
      aiConfig.maxTokens =
        num(process.env.DEEPSEEK_MAX_TOKENS) ?? defaultAIConfig.maxTokens;
      aiConfig.topP = num(process.env.DEEPSEEK_TOP_P) ?? defaultAIConfig.topP;
      // DeepSeek ignores topK
      if (!aiConfig.key) {
        console.error(
          "❌ DEEPSEEK_API_KEY is not set. Get one from https://platform.deepseek.com/ (or relevant portal)"
        );
      }
      break;
    case LLMProvider.Ollama: // <-- add
      aiConfig.provider = LLMProvider.Ollama;
      aiConfig.model = process.env.OLLAMA_MODEL || "mistral";
      aiConfig.key = ""; // not used for local Ollama
      aiConfig.temperature =
        num(process.env.OLLAMA_TEMPERATURE) ?? defaultAIConfig.temperature;
      aiConfig.maxTokens =
        num(process.env.OLLAMA_MAX_TOKENS) ?? defaultAIConfig.maxTokens;
      aiConfig.contextLength =
        num(process.env.OLLAMA_CONTEXT_LENGTH) ?? defaultAIConfig.contextLength;
      aiConfig.topP = num(process.env.OLLAMA_TOP_P) ?? defaultAIConfig.topP;
      aiConfig.topK = num(process.env.OLLAMA_TOP_K) ?? defaultAIConfig.topK;
      if (!process.env.OLLAMA_BASE_URL) {
        console.warn(
          "OLLAMA_BASE_URL not set, defaulting to http://localhost:11434"
        );
      }
      break;
    default:
      console.warn(
        `Unsupported LLM_PROVIDER '${provider}', defaulting to '${defaultAIConfig.provider}'`
      );
      break;
  }

  // Load system prompt from file if specified
  if (process.env.SYSTEM_PROMPT_FILE) {
    try {
      aiConfig.systemPrompt = readFileSync(
        process.env.SYSTEM_PROMPT_FILE,
        "utf8"
      );
    } catch (error) {
      console.warn(
        `Failed to load system prompt from file: ${process.env.SYSTEM_PROMPT_FILE}. Using existing value.`
      );
    }
  } else
    aiConfig.systemPrompt =
      process.env.SYSTEM_PROMPT || defaultAIConfig.systemPrompt;

  // Load user prompt from file if specified
  if (process.env.USER_PROMPT_FILE) {
    try {
      aiConfig.userPrompt = readFileSync(process.env.USER_PROMPT_FILE, "utf8");
    } catch (error) {
      console.warn(
        `Failed to load user prompt from file: ${process.env.USER_PROMPT_FILE}. Using existing value.`
      );
    }
  } else
    aiConfig.userPrompt = process.env.USER_PROMPT || defaultAIConfig.userPrompt;

  if (!aiConfig.systemPrompt) {
    console.warn(
      "System prompt is empty. It's recommended to set a system prompt for better AI performance."
    );
  }
  if (!aiConfig.userPrompt) {
    console.warn(
      "User prompt is empty. It's recommended to set a user prompt for better AI performance."
    );
  }

  return aiConfig;
}
