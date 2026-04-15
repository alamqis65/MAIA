import { fetch, Agent } from "undici";
import { LLMClient } from "./base.js";
import { AIConfig } from "../interfaces.js";

type OllamaChatMessage = { role: "system" | "user" | "assistant"; content: string };

// setGlobalDispatcher(new Agent({
//   headersTimeout: 60_000,
//   bodyTimeout: 300_000,
// }));

export class OllamaClient implements LLMClient {
  constructor(private _cfg: AIConfig) {}

  name() { return this._cfg.provider; }

  async generateJSONResponse({ systemPrompt, userPrompt, assistantPrompt }: { systemPrompt: string; userPrompt: string; assistantPrompt?: string; }): Promise<string> {
    const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434";

    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    if (assistantPrompt) {
      messages.push({ role: "assistant", content: assistantPrompt });
    }

    const body = {
      model: this._cfg.model,           // e.g. "mistral", "qwen2:7b", "phi3"
      messages,
      stream: false,
      format: "json",
      options: {
        temperature: this._cfg.temperature,
        top_p: this._cfg.topP,
        top_k: this._cfg.topK,
        num_ctx: this._cfg.contextLength,   // context length, if supported by model, e.g. 2048, 8192, reduce if long history is not needed.
        num_predict: this._cfg.maxTokens    // max tokens to generate, if supported by model, e.g. 512, 1024, 2048, 4096, reduce if shorter output is desired. default is 1024.
      }
    };

    const ollamaAgent = new Agent({
      keepAliveTimeout: 180_000,
      keepAliveMaxTimeout: 300_000,

      // The ones that matter:
      headersTimeout: 900_000, // 15 minutes for first byte/headers
      bodyTimeout: 0,          // disable body timeout (streaming can be long)
    });

    console.log(`\n-----------------------------------`);
    console.log(`OllamaClient.generateJSONResponse called.`);
    console.log(`Ollama request to ${baseUrl}/api/chat with model ${this._cfg.model}`);
    console.log("Ollama request body:", JSON.stringify(body, null, 2));
    console.log(`-----------------------------------\n`);
    

    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      dispatcher: ollamaAgent
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Ollama error ${resp.status}: ${text}`);
    }

    const data = await resp.json() as any;
    console.log(`\n-----------------------------------`);
    console.log("Ollama response data:", JSON.stringify(data, null, 2));
    console.log(`-----------------------------------\n`);
    
    // Expected shape: { message: { role, content }, ... }
    return data?.message?.content?.trim() || "";

    // Return full provider response as a JSON string and caller can decide what to extract
    //return JSON.stringify(data);
  }
}