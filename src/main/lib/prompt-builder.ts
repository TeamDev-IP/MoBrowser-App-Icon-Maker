/**
 * System-level design constraints prepended to every icon generation request.
 * Users should never directly control the full prompt — these constraints drive
 * the majority of output quality.  Reducing prompt entropy (fewer adjectives,
 * stricter rules) keeps output consistent across generations.
 */
const SYSTEM_PREFIX =
  "Premium macOS app icon, centered composition, single object, no text, " +
  "no background clutter, soft shadow, subtle gradient, consistent stroke width, " +
  "rounded square canvas, Apple Human Interface Guidelines style, minimalistic, " +
  "clean, high contrast, 3D depth with soft lighting, glass/liquid material, " +
  "professional UI icon, SF Symbols inspired";

/**
 * Concepts to steer the model away from.  Used by providers that support
 * negative prompts (e.g. Google Imagen).  For providers without native negative
 * prompt support (e.g. DALL-E 3), the positive prompt constraints do the work.
 */
export const NEGATIVE_PROMPT =
  "text, letters, words, watermark, multiple objects, cluttered, low quality, " +
  "blurry, distorted, noisy, photorealistic photo, flat without depth, " +
  "dark background, busy pattern, outer border frame, drop shadow on white";

export interface BuiltPrompt {
  positive: string;
  negative: string;
}

/**
 * Wrap the user's intent in system-level macOS icon design constraints.
 *
 * The caller provides the raw user intent (e.g. "clipboard manager icon") and
 * receives a fully-formed prompt pair ready to send to any image provider.
 */
export function buildPrompt(userIntent: string): BuiltPrompt {
  const intent = userIntent.trim();
  return {
    positive: `${SYSTEM_PREFIX}, ${intent}`,
    negative: NEGATIVE_PROMPT,
  };
}
