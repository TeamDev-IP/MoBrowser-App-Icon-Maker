import { GoogleGenAI } from "@google/genai";
import type { ImageProvider, GenerationRequest, GenerationResult } from "../image-provider";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Model used for image generation.
 *
 *  - "gemini-3.1-flash-image-preview" — the current Google AI Studio image
 *    generation model (marketed as "Nano Banana 2").  Requires a paid API key
 *    (free-tier quota is 0 for this model).
 *  - "imagen-4.0-generate-001" — highest quality, paid tier only, uses
 *    generateImages instead of generateContent.
 *
 * Override with the GOOGLE_IMAGE_MODEL environment variable.
 */
const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";

/** Number of attempts before giving up on a single variant. */
const MAX_RETRIES = 3;

/** Race individual SDK calls against this timeout (ms). */
const REQUEST_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// 429-aware retry helper
// ---------------------------------------------------------------------------

/**
 * Retry `fn` up to `maxAttempts` times.
 * On HTTP 429, the Google API includes a `retryDelay` field in the error body
 * (e.g. "49s"). We parse and honour that delay before retrying.
 * Falls back to linear back-off (1 s, 2 s, …) for all other errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;

      // Parse retryDelay from Google's 429 response if available.
      const delayMs = parseRetryDelay(err) ?? 1_000 * attempt;
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

/** Extract the retry delay in ms from a Google API error, if present. */
function parseRetryDelay(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  // Google SDK surfaces the raw error body in the message.
  const match = err.message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (match) return Math.ceil(parseFloat(match[1]) * 1_000);
  return null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Google image generation provider via Google AI Studio.
 *
 * Variants are generated sequentially to stay within per-minute rate limits.
 *
 * Required environment variable: GOOGLE_API_KEY
 * Obtain a paid-tier key at: https://aistudio.google.com/app/apikey
 */
export class GoogleImagenProvider implements ImageProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor() {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error(
        "GOOGLE_API_KEY environment variable is not set. " +
          "Export it in your shell before launching the app, or obtain a key at " +
          "https://aistudio.google.com/app/apikey"
      );
    }
    this.client = new GoogleGenAI({ apiKey: key });
    this.model = process.env.GOOGLE_IMAGE_MODEL ?? DEFAULT_MODEL;
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    // Sequential generation to respect per-minute rate limits.
    // Parallel calls triple the instantaneous quota usage.
    const images: string[] = [];
    for (let i = 0; i < request.count; i++) {
      const img = await withRetry(() => this.generateOne(request.positivePrompt), MAX_RETRIES);
      images.push(img);
    }
    return { images };
  }

  private async generateOne(prompt: string): Promise<string> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Google image request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)),
        REQUEST_TIMEOUT_MS
      )
    );

    const call = this.client.models.generateContent({
      model: this.model,
      contents: prompt,
    });

    const response = await Promise.race([call, timeout]);

    // Find the first part that carries inline image data.
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      throw new Error(
        "Google returned no image data. " +
          "This model requires a paid Google AI Studio API key " +
          "(free-tier quota is 0). Enable billing at https://aistudio.google.com/app/apikey"
      );
    }

    return imagePart.inlineData.data;
  }
}
