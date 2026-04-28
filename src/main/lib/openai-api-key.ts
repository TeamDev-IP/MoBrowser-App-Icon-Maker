import { prefs } from '@mobrowser/api';

/** Preferences key for the OpenAI API key (stored in prefs.json). */
export const OPENAI_API_KEY_PREFS_KEY = 'openai.apiKey';

/** True when a non-empty key has been saved in application preferences. */
export function hasOpenAIApiKeyInPrefs(): boolean {
  return prefs.getString(OPENAI_API_KEY_PREFS_KEY).trim().length > 0;
}

/**
 * Returns the API key from saved preferences only (not from environment variables).
 */
export function getResolvedOpenAIApiKey(): string {
  return prefs.getString(OPENAI_API_KEY_PREFS_KEY).trim();
}
