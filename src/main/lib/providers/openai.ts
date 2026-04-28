import type { ImageProvider, GenerationRequest, GenerationResult } from "../image-provider";
import { withRetry } from "../image-provider";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const EDITS_URL = "https://api.openai.com/v1/images/edits";

/** Abort individual HTTP requests after this many milliseconds. */
const REQUEST_TIMEOUT_MS = 90_000;

/** How many times to retry a failed request before giving up. */
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

interface ImageResponse {
  data: Array<{ b64_json: string }>;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * OpenAI gpt-image-1 image generation provider.
 *
 * gpt-image-1 supports n=1..10 per request, so all variants are fetched in
 * a single API call.
 *
 * Required environment variable: OPENAI_API_KEY
 */
export class OpenAIProvider implements ImageProvider {
  private readonly apiKey: string;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY environment variable is not set. " +
          "Export it in your shell before launching the app."
      );
    }
    this.apiKey = key;
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const images = request.referenceImageB64
      ? await this.editBatch(request.positivePrompt, request.referenceImageB64, request.count)
      : await this.generateBatch(request.positivePrompt, request.count);
    return { images };
  }

  /** Text-to-image via /v1/images/generations. */
  private generateBatch(prompt: string, n: number): Promise<string[]> {
    return withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
      );

      try {
        const res = await fetch(GENERATIONS_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt,
            n,
            size: "1024x1024",
            quality: "high",
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`OpenAI API error ${res.status}: ${body}`);
        }

        const json = (await res.json()) as ImageResponse;
        const images = json.data.map((item) => item.b64_json).filter(Boolean);
        if (images.length === 0) throw new Error("OpenAI returned no image data.");

        return images;
      } finally {
        clearTimeout(timeoutId);
      }
    }, MAX_RETRIES);
  }

  /** Image-to-image edit via /v1/images/edits. Sends the reference as multipart. */
  private editBatch(prompt: string, referenceB64: string, n: number): Promise<string[]> {
    return withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
      );

      try {
        const imageBuffer = Buffer.from(referenceB64, "base64");
        const form = new FormData();
        form.append("model", "gpt-image-1");
        form.append("prompt", prompt);
        form.append("n", String(n));
        form.append("size", "1024x1024");
        form.append("quality", "high");
        form.append(
          "image",
          new Blob([imageBuffer], { type: "image/png" }),
          "reference.png"
        );

        const res = await fetch(EDITS_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: form,
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`OpenAI API error ${res.status}: ${body}`);
        }

        const json = (await res.json()) as ImageResponse;
        const images = json.data.map((item) => item.b64_json).filter(Boolean);
        if (images.length === 0) throw new Error("OpenAI returned no image data.");

        return images;
      } finally {
        clearTimeout(timeoutId);
      }
    }, MAX_RETRIES);
  }
}
