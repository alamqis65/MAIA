import { LLMProvider } from './types.js';

export interface AIConfig {
  provider: LLMProvider; // gemini | openai | deepseek | etc...
  model: string;
  key: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number; // Some providers ignore topK
}
