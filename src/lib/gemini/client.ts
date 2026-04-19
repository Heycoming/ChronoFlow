/**
 * Thin wrapper around @google/genai so callers don't re-instantiate and so
 * tests can inject a fake.
 */
import { GoogleGenAI } from "@google/genai";

export interface GeminiClient {
  generateJson(args: {
    prompt: string;
    responseJsonSchema: unknown;
    model?: string;
    temperature?: number;
  }): Promise<string>;
}

let cached: GoogleGenAI | null = null;

function getSdk(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

const GEMINI_TIMEOUT_MS = 120_000; // 120s — gemini-2.5-flash can think for a while

export const defaultGeminiClient: GeminiClient = {
  async generateJson({ prompt, responseJsonSchema, model, temperature }) {
    const ai = getSdk();
    const modelId = model ?? "gemini-2.5-flash";
    console.log(`[Gemini] Calling ${modelId} (prompt length: ${prompt.length} chars)…`);
    const start = Date.now();

    // Use Promise.race for reliable timeout — the SDK's abortSignal doesn't
    // always kill the underlying HTTP connection.
    const apiCall = ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema,
        temperature: temperature ?? 0.4,
        // Cap thinking budget to avoid 2.5-flash spending 60s "thinking"
        // before emitting any tokens.
        thinkingConfig: { thinkingBudget: 2048 },
      },
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Gemini timed out after ${GEMINI_TIMEOUT_MS}ms`)),
        GEMINI_TIMEOUT_MS,
      ),
    );

    try {
      const response = await Promise.race([apiCall, timeout]);
      const elapsed = Date.now() - start;
      console.log(`[Gemini] Response received in ${elapsed}ms`);
      const text = response.text;
      if (!text) throw new Error("Gemini returned an empty response");
      return text;
    } catch (err) {
      const elapsed = Date.now() - start;
      console.error(`[Gemini] Failed after ${elapsed}ms:`, (err as Error).message);
      throw err;
    }
  },
};
