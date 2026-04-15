import OpenAI from "openai";

import { LLMClient } from "./base.js";
import { AIConfig } from "../interfaces.js";
import e from "express";

export class OpenAIClient implements LLMClient {
  private _client: OpenAI;

  constructor(private _cfg: AIConfig) {
    if (!this._cfg.key) {
      throw new Error("OPENAI_API_KEY missing.");
    }
    this._client = new OpenAI({ apiKey: this._cfg.key });
  }

  name() {
    return this._cfg.provider;
  }

  async generateJSONResponse({
    systemPrompt,
    userPrompt,
    assistantPrompt,
  }: {
    systemPrompt: string;
    userPrompt: string;
    assistantPrompt?: string;
  }): Promise<string> {
    // Using Chat Completions for broader model compatibility.
    // Newer OpenAI responses-style models (e.g. o4, gpt-4.1, gpt-4o-mini) deprecate 'max_tokens' in favor of 'max_completion_tokens'.
    // The OpenAI Node SDK v4 will reject unknown params, so construct dynamically.
    const base: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this._cfg.model,
      messages: assistantPrompt
        ? [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
            { role: "assistant", content: assistantPrompt },
          ]
        : [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "soapi_record",
          schema: {
            type: "object",
            required: ["patientId", "displayId", "rawTranscript", "soapi"],
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
                  subjective: { type: "object" },
                  objective: { type: "object" },
                  assessment: { type: "object" },
                  plan: { type: "object" },
                  intervention: { type: "object" },
                },
              },
            },
            additionalProperties: false,
          },
        },
      },
      //max_completion_tokens: this._cfg.maxTokens
    };

    // this temperature is currently not supported in openai's some models
    // if (this._cfg.temperature !== undefined) {
    //    base.temperature = this._cfg.temperature;
    // }

    // this temperature is currently not supported in openai's some models
    // if (this._cfg.topP !== undefined) {
    //    base.top_p = this._cfg.topP;
    // }

    let resp;
    try {
      console.log(`\n`);
      console.log(`OpenAI Model: ${this._cfg.model}\n`);
      console.log(`Request:\n`, JSON.stringify(base, null, 2));
      const _start = process.hrtime.bigint();

      resp = await this._client.chat.completions.create(base); //  <-- calling OpenAI API

      const _end = process.hrtime.bigint();
      const _durationMs = Number(_end - _start) / 1_000_000; // ns -> ms
      console.log(`Response time: ${_durationMs.toFixed(2)} ms`);
      console.log(`Response:\n`, JSON.stringify(resp, null, 2));
      console.log(`\n`);

      // Validate and transform the response into SOAPI format
      const soapiResponse = this.transformToSOAPI(resp);
      return JSON.stringify(soapiResponse, null, 2);
    } catch (err: any) {
      console.error("OpenAI API error:", err);
      throw err;
    }
  }

  // Helper function to transform and validate the response
  private transformToSOAPI(resp: any): any {
    const rawContent = resp?.choices?.[0]?.message?.content || "";

    console.log("RAW CONTENT: ", rawContent);

    // Example validation and transformation logic
    try {
      const parsedContent = JSON.parse(rawContent);

      // Validate required fields
      if (
        !parsedContent.patientId ||
        !parsedContent.rawTranscript ||
        !parsedContent.soapi
      ) {
        throw new Error("Invalid SOAPI response format");
      }

      // Ensure SOAPI object contains all required sections
      const { subjective, objective, assessment, plan, intervention } =
        parsedContent.soapi;
      if (!subjective || !objective || !assessment || !plan || !intervention) {
        throw new Error("Incomplete SOAPI sections");
      }

      return parsedContent;
    } catch (error) {
      console.error("Response validation failed:", error);
      throw new Error("Failed to transform response into SOAPI format");
    }
  }
}
