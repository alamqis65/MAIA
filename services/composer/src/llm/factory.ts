import { LLMProvider } from "../types.js";
import { AIConfig } from "../interfaces.js";
import { LLMClient } from "./base.js";
import { GeminiClient } from "./gemini.js";
import { OpenAIClient } from "./openai.js";
import { DeepSeekClient } from "./deepseek.js";
import { OllamaClient } from "./ollama.js";
import { GroqdClient } from "./groqd.js";

export function createLLM(cfg: AIConfig): LLMClient {
   switch (cfg.provider) {
      case LLMProvider.OpenAI:
         return new OpenAIClient(cfg);
      case LLMProvider.DeepSeek:
         return new DeepSeekClient(cfg);
      case LLMProvider.Gemini:
         return new GeminiClient(cfg);
      case LLMProvider.Groqd:
         return new GroqdClient(cfg);
      case LLMProvider.Ollama:
      default:
         return new OllamaClient(cfg);
   }
}
