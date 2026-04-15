export interface LLMClient {
  /** Provider name identifier (e.g., gemini, openai) */
  name(): string;
  /**
   * Generate a JSON (or JSON fenced) response given system + user prompts.
   * Implementations should return raw text (not yet parsed) so caller can clean / parse.
   */
  generateJSONResponse(args: { systemPrompt: string; userPrompt: string; assistantPrompt?: string }): Promise<string>;
}
