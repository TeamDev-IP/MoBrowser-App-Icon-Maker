import type {
  ImageProvider,
  GenerationRequest,
  GenerationResult,
} from "../image-provider";
import { withRetry } from "../image-provider";
import { getResolvedApiKey } from "../openai-api-key";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Default image model. "Nano Banana" — supports text-to-image, image editing
 * (reference image), and 1:1 aspect ratio. Override with OPENROUTER_MODEL.
 */
const DEFAULT_MODEL = "google/gemini-2.5-flash-image";

/** Optional attribution headers OpenRouter shows on its activity dashboard. */
const REFERER = "https://github.com/mo-browser-apps/icons";
const TITLE = "MoIcons";

/** Abort individual HTTP requests after this many milliseconds. */
const REQUEST_TIMEOUT_MS = 90_000;

/** How many times to retry a failed request before giving up. */
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Response shape (only the fields we read)
// ---------------------------------------------------------------------------

interface ChatImagePart {
  type?: string;
  image_url?: { url?: string };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      images?: ChatImagePart[];
      content?: string | ChatImagePart[];
    };
  }>;
}

class OpenRouterHttpError extends Error {
  constructor(
    readonly status: number,
    body: string
  ) {
    super(`OpenRouter API error ${status}: ${body}`);
    this.name = "OpenRouterHttpError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retry network failures, throttling, timeouts, and server errors. */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof OpenRouterHttpError)) return true;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

/** Strip a `data:<mime>;base64,` prefix, returning the raw base64 payload. */
function dataUrlToBase64(url: string): string {
  const comma = url.indexOf(",");
  return comma >= 0 ? url.slice(comma + 1) : url;
}

/**
 * Pull the first generated image out of an OpenRouter chat completion.
 * Images normally arrive in `message.images[].image_url.url` as a data URL,
 * but we also scan `message.content` defensively.
 */
function extractImageB64(json: ChatCompletionResponse): string | null {
  const message = json.choices?.[0]?.message;
  if (!message) return null;

  const fromImages = message.images?.find((p) => p?.image_url?.url)?.image_url?.url;
  if (fromImages) return dataUrlToBase64(fromImages);

  if (Array.isArray(message.content)) {
    const fromContent = message.content.find(
      (p) => p?.type === "image_url" && p.image_url?.url
    )?.image_url?.url;
    if (fromContent) return dataUrlToBase64(fromContent);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * OpenRouter image generation provider.
 *
 * Unlike OpenAI's `/images/generations`, OpenRouter generates images through
 * the `/chat/completions` endpoint with `modalities: ["image", "text"]`, and
 * returns a single image per call. To produce `count` variants we fan out that
 * many requests in parallel.
 *
 * API key: read from application preferences only (an `sk-or-…` key).
 */
export class OpenRouterProvider implements ImageProvider {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const apiKey = getResolvedApiKey();
    if (!apiKey) {
      throw new Error(
        "No OpenRouter API key. Use the startup dialog or save a key in app preferences."
      );
    }

    const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
    const count = Math.max(1, request.count);

    // One image per request → fire `count` requests concurrently.
    const settled = await Promise.allSettled(
      Array.from({ length: count }, () =>
        this.generateOne(
          apiKey,
          model,
          request.positivePrompt,
          request.referenceImageB64
        )
      )
    );

    const images = settled
      .filter(
        (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled"
      )
      .map((r) => r.value);

    if (images.length === 0) {
      // Surface the first failure (preserves 401/403 so the UI can re-prompt
      // for the key).
      const firstRejection = settled.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      const reason = firstRejection?.reason;
      throw reason instanceof Error
        ? reason
        : new Error(String(reason ?? "OpenRouter returned no image data."));
    }

    return { images };
  }

  /** Generate a single image via one chat-completion request. */
  private generateOne(
    apiKey: string,
    model: string,
    prompt: string,
    referenceB64?: string
  ): Promise<string> {
    return withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        // For an edit, the reference image precedes the text instruction.
        const content: ChatImagePart[] | Array<Record<string, unknown>> = [];
        if (referenceB64) {
          content.push({
            type: "image_url",
            image_url: { url: `data:image/png;base64,${referenceB64}` },
          });
        }
        content.push({ type: "text", text: prompt });

        const res = await fetch(CHAT_COMPLETIONS_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": REFERER,
            "X-Title": TITLE,
          },
          body: JSON.stringify({
            model,
            modalities: ["image", "text"],
            // Icons must be square; pin the aspect ratio.
            image_config: { aspect_ratio: "1:1" },
            messages: [{ role: "user", content }],
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new OpenRouterHttpError(res.status, body);
        }

        const json = (await res.json()) as ChatCompletionResponse;
        const image = extractImageB64(json);
        if (!image) {
          throw new Error(
            "OpenRouter returned no image. Ensure the selected model supports image output."
          );
        }
        return image;
      } finally {
        clearTimeout(timeoutId);
      }
    }, MAX_RETRIES, 1_000, isRetryableError);
  }
}
