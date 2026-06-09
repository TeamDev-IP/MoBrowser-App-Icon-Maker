import { prefs } from '@mobrowser/api';

/**
 * Preferences key for the stored image-generation API key (kept in prefs.json).
 *
 * The same slot holds either an OpenAI key (`sk-…`) or an OpenRouter key
 * (`sk-or-…`); the active provider is inferred from the key's prefix at call
 * time — see `detectProviderFromKey`.  The legacy name is preserved so existing
 * preferences continue to resolve after upgrade.
 */
export const API_KEY_PREFS_KEY = 'openai.apiKey';

/** Backwards-compatible alias for the preferences key. */
export const OPENAI_API_KEY_PREFS_KEY = API_KEY_PREFS_KEY;

/** True when a non-empty key has been saved in application preferences. */
export function hasApiKeyInPrefs(): boolean {
  return prefs.getString(API_KEY_PREFS_KEY).trim().length > 0;
}

/** Backwards-compatible alias. */
export const hasOpenAIApiKeyInPrefs = hasApiKeyInPrefs;

/**
 * Returns the API key from saved preferences only (not from environment
 * variables). Empty string when none is stored.
 */
export function getResolvedApiKey(): string {
  return prefs.getString(API_KEY_PREFS_KEY).trim();
}

/** Backwards-compatible alias. */
export const getResolvedOpenAIApiKey = getResolvedApiKey;

/**
 * Infer which provider a key belongs to from its prefix.
 *
 * OpenRouter keys are always of the form `sk-or-v1-…` (`sk-or-` prefix), which
 * is distinct from every OpenAI key shape (`sk-`, `sk-proj-`, `sk-svcacct-`, …).
 * Anything that is not recognizably an OpenRouter key is treated as OpenAI.
 */
export function detectProviderFromKey(key: string): 'openai' | 'openrouter' {
  return key.trim().startsWith('sk-or-') ? 'openrouter' : 'openai';
}
