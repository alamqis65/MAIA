import {
  GenerateContentRequest,
  GoogleGenerativeAI,
  SchemaType,
} from "@google/generative-ai";

import { LLMClient } from "./base.js";
import { AIConfig } from "../interfaces.js";

import { readFileSync } from "fs";

export class GeminiClient implements LLMClient {
  private _model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;

  constructor(private _cfg: AIConfig) {
    if (!this._cfg.key) {
      throw new Error("GEMINI_API_KEY missing.");
    }
    const responseSchema = {
      type: SchemaType.OBJECT,
      properties: {
        patientId: { type: SchemaType.STRING },
        displayId: { type: SchemaType.STRING },
        rawTranscript: { type: SchemaType.STRING },
        soapi: {
          type: SchemaType.OBJECT,
          properties: {
            subjective: {
              type: SchemaType.OBJECT,
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
              properties: {
                pemeriksaan_fisik: { type: SchemaType.STRING },
                tanda_vital: { type: SchemaType.STRING },
                hasil_lab: { type: SchemaType.STRING },
              },
              required: ["pemeriksaan_fisik", "tanda_vital", "hasil_lab"],
            },
            assessment: {
              type: SchemaType.OBJECT,
              properties: {
                diagnosa: { type: SchemaType.STRING },
                kesan_klinis: { type: SchemaType.STRING },
                diagnosa_banding: { type: SchemaType.STRING },
              },
              required: ["diagnosa", "kesan_klinis", "diagnosa_banding"],
            },
            plan: {
              type: SchemaType.OBJECT,
              properties: {
                terapi: { type: SchemaType.STRING },
                obat: { type: SchemaType.STRING },
                tindak_lanjut: { type: SchemaType.STRING },
              },
              required: ["terapi", "obat", "tindak_lanjut"],
            },
            intervention: {
              type: SchemaType.OBJECT,
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
    };
    const genAI = new GoogleGenerativeAI(this._cfg.key);

    let systemPromt = ""

    let systemPromptFile = process.env.SYSTEM_PROMPT_FILE;
    if (!systemPromptFile) {
      throw new Error("SYSTEM_PROMPT_FILE is not defined");
    }else{
      systemPromt = readFileSync(systemPromptFile, "utf8");
    }

    this._model = genAI.getGenerativeModel({
      model: this._cfg.model,
      systemInstruction: systemPromt,
      generationConfig: {
        temperature: this._cfg.temperature,
        maxOutputTokens: this._cfg.maxTokens,
        topP: this._cfg.topP,
        topK: this._cfg.topK,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });
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
    console.log(`Using Gemini Model: ${this._cfg.model}\n`);
    console.log(`System Prompt: ${systemPrompt}\n`);
    console.log(`User Prompt: ${userPrompt}\n`);

// 1. Konstruksi contents hanya berisi riwayat percakapan yang sebenarnya
   const contents = [
      { role: "user", parts: [{ text: userPrompt }] }
   ];

   // 2. Jika ada assistantPrompt (misal: Few-shot prompting atau konteks sebelumnya), tambahkan sebagai role 'model'
   if (assistantPrompt) {
      contents.push({ role: "model", parts: [{ text: assistantPrompt }] });
   }

   const request: GenerateContentRequest = { contents };

    console.log(`\n`);
    console.log(`Gemini Model: ${this._cfg.model}\n`);
    console.log(`Request:\n`, JSON.stringify(request, null, 2));
    const _start = process.hrtime.bigint();

    const result = await this._model.generateContent(request); //  <-- calling Gemini API
    const _end = process.hrtime.bigint();
    const _durationMs = Number(_end - _start) / 1_000_000; // ns -> ms
    console.log(`Response time: ${_durationMs.toFixed(2)} ms`);
    console.log(`Response:\n`, JSON.stringify(result, null, 2));
    console.log(`\n`);

    return result.response.text().trim();
  }
}
