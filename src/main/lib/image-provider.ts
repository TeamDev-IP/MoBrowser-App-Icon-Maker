import { OpenAIProvider } from "./providers/openai";
import { GoogleImagenProvider } from "./providers/google-imagen";
import { MockImageProvider } from "./providers/mock";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface GenerationRequest {
  positivePrompt: string;
  negativePrompt: string;
  /** Base64-encoded PNG, no data URL prefix.  Omit for text-to-image. */
  referenceImageB64?: string;
  /** Number of icon variants to generate. */
  count: number;
}

export interface GenerationResult {
  /**
   * Base64-encoded PNG strings with the squircle mask pre-applied.
   * No data URL prefix — compatible with the existing IPC contract.
   */
  images: string[];
}

/** Common interface implemented by every image generation back-end. */
export interface ImageProvider {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

// ---------------------------------------------------------------------------
// Supported providers
// ---------------------------------------------------------------------------

export type ProviderName = "openai" | "google-imagen" | "mock";

// ---------------------------------------------------------------------------
// Lazy singleton — one provider instance per process lifetime
// ---------------------------------------------------------------------------

let _activeProvider: ImageProvider | null = null;

/**
 * Return the active provider, instantiating it on first call.
 *
 * The provider is selected by the `ICON_PROVIDER` environment variable
 * (`"openai"`, `"google-imagen"`, or `"mock"`).  Defaults to `"openai"`.
 *
 * Required environment variables:
 *   - openai:         OPENAI_API_KEY
 *   - google-imagen:  GOOGLE_API_KEY
 *   - mock:           none (placeholder images only, for local testing)
 */
export function getProvider(): ImageProvider {
  if (_activeProvider) return _activeProvider;

  const name =
    (process.env.ICON_PROVIDER as ProviderName | undefined) ?? "openai";

  let created: ImageProvider;
  switch (name) {
    case "mock":
      created = new MockImageProvider();
      break;
    case "google-imagen":
      created = new GoogleImagenProvider();
      break;
    default:
      created = new OpenAIProvider();
  }
  _activeProvider = created;
  return created;
}

// ---------------------------------------------------------------------------
// Shared retry utility
// ---------------------------------------------------------------------------

/**
 * Run `fn` up to `maxAttempts` times.  On failure before the last attempt,
 * waits `initialDelayMs × attempt` milliseconds before retrying (linear back-off).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  initialDelayMs = 1_000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise<void>((r) => setTimeout(r, initialDelayMs * attempt));
      }
    }
  }
  throw lastError;
}
