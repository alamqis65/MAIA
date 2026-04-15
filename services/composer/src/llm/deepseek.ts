import OpenAI from "openai";

import { LLMClient } from "./base.js";
import { AIConfig } from "../interfaces.js";

/**
 * DeepSeek provider implementation.
 * DeepSeek exposes an OpenAI-compatible API surface at https://api.deepseek.com.
 * Leverage the official OpenAI client with a custom baseURL to minimize code.
 */
export class DeepSeekClient implements LLMClient {
   private _client: OpenAI;

   constructor(private _cfg: AIConfig) {
      if (!this._cfg.key) {
         throw new Error("DEEPSEEK_API_KEY missing.");
      }
      this._client = new OpenAI({ apiKey: this._cfg.key, baseURL: 'https://api.deepseek.com' });
   }

   name() { return this._cfg.provider; }

   async generateJSONResponse({ systemPrompt, userPrompt, assistantPrompt }: { systemPrompt: string; userPrompt: string; assistantPrompt?: string; }): Promise<string> {
      const resp = await this._client.chat.completions.create({
         model: this._cfg.model, // e.g. deepseek-chat | deepseek-reasoner
         temperature: this._cfg.temperature,
         max_tokens: this._cfg.maxTokens,
         top_p: this._cfg.topP,
         messages: assistantPrompt ? [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: assistantPrompt }
         ] : [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
         ]
      });
      return resp.choices?.[0]?.message?.content?.trim() || '';
   }
}
