import Groq from "groq-sdk";

import { LLMClient } from "./base.js";
import { AIConfig } from "../interfaces.js";
import { SchemaType } from "../types.js";

export class GroqdClient implements LLMClient {
  private _model: Groq;

  constructor(private _cfg: AIConfig) {
    if (!this._cfg.key) {
      throw new Error("GROQD_API_KEY missing.");
    }
    this._model = new Groq({ apiKey: this._cfg.key });
  }
  name(): string {
    return "groqd";
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
    const response = "";

    const param: any = {
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
          strict: true,
          schema: {
            type: SchemaType.OBJECT,
            additionalProperties: false,
            properties: {
              patientId: { type: SchemaType.STRING },
              displayId: { type: SchemaType.STRING },
              rawTranscript: { type: SchemaType.STRING },

              soapi: {
                type: SchemaType.OBJECT,
                additionalProperties: false,
                properties: {
                  subjective: {
                    type: SchemaType.OBJECT,
                    additionalProperties: false,
                    properties: {
                      keluhan_utama: { type: SchemaType.STRING },
                      riwayat_penyakit_sekarang: { type: SchemaType.STRING },
                      gejala_lain: { type: SchemaType.STRING },
                    },
                    required: [
                      "keluhan_utama",
                      "riwayat_penyakit_sekarang",
                      "gejala_lain",
                    ],
                  },

                  objective: {
                    type: SchemaType.OBJECT,
                    additionalProperties: false,
                    properties: {
                      pemeriksaan_fisik: { type: SchemaType.STRING },
                      tanda_vital: { type: SchemaType.STRING },
                      hasil_lab: { type: SchemaType.STRING },
                    },
                    required: ["pemeriksaan_fisik", "tanda_vital", "hasil_lab"],
                  },

                  assessment: {
                    type: SchemaType.OBJECT,
                    additionalProperties: false,
                    properties: {
                      diagnosa: { type: SchemaType.STRING },
                      kesan_klinis: { type: SchemaType.STRING },
                      diagnosa_banding: { type: SchemaType.STRING },
                    },
                    required: ["diagnosa", "kesan_klinis", "diagnosa_banding"],
                  },

                  plan: {
                    type: SchemaType.OBJECT,
                    additionalProperties: false,
                    properties: {
                      terapi: { type: SchemaType.STRING },
                      obat: { type: SchemaType.STRING },
                      tindak_lanjut: { type: SchemaType.STRING },
                    },
                    required: ["terapi", "obat", "tindak_lanjut"],
                  },

                  intervention: {
                    type: SchemaType.OBJECT,
                    additionalProperties: false,
                    properties: {
                      tindakan: { type: SchemaType.STRING },
                      prosedur: { type: SchemaType.STRING },
                      kondisi_darurat: { type: SchemaType.STRING },
                    },
                    required: ["tindakan", "prosedur", "kondisi_darurat"],
                  },
                },
                required: [
                  "subjective",
                  "objective",
                  "assessment",
                  "plan",
                  "intervention",
                ],
              },
            },
            required: ["patientId", "displayId", "rawTranscript", "soapi"],
          },
        },
      },
      temperature: this._cfg.temperature,
      max_completion_tokens: this._cfg.maxTokens,
    };

    let resp;
    try {
      console.log(`\n`);
      console.log(`groqd Model: ${this._cfg.model}\n`);
      console.log(`Request:\n`, JSON.stringify(param, null, 2));
      const _start = process.hrtime.bigint();

      resp = await this._model.chat.completions.create(param); //  <-- calling OpenAI API
      const msg = resp.choices[0].message.content
      const parsed = JSON.parse(msg || '{}');

      const _end = process.hrtime.bigint();
      const _durationMs = Number(_end - _start) / 1_000_000; // ns -> ms
      console.log(`Response time: ${_durationMs.toFixed(2)} ms`);
      console.log(`Response:\n`, JSON.stringify(parsed, null, 2));
      console.log(`\n`);

      return JSON.stringify(parsed, null, 2);
    } catch (err: any) {
      console.error("groqd API error:", err);
      throw err;
    }

    return response;
  }
}
