/**
 * Credential configuration.
 *
 * SangeetPremi never ships API secrets. To enable live YouTube Data API
 * discovery, a developer must:
 *   1. Create a project in Google Cloud Console, enable the YouTube Data
 *      API v3, and create an API key (restricted to the YouTube Data API).
 *   2. Create an OAuth 2.0 Client ID of type "Chrome Extension" (for the
 *      optional "Create playlist on YouTube" feature) and set the extension
 *      id in the Cloud Console.
 *   3. Provide them at runtime via the Settings page (stored locally in
 *      chrome.storage.local, never committed, never sent anywhere except
 *      Google's own OAuth/API endpoints).
 *
 * See docs/SETUP_YOUTUBE_API.md for the full walkthrough.
 */
export interface RuntimeConfig {
  youtubeApiKey: string | null;
  youtubeClientId: string | null;
}

const CONFIG_KEY = 'sangeetpremi.config';

function getBackend(): Pick<typeof chrome.storage.local, 'get' | 'set'> | null {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) return chrome.storage.local;
  return null;
}

/** In-memory fallback used when running outside an extension (dev/tests). */
const memoryFallback = new Map<string, unknown>();

export async function loadConfig(): Promise<RuntimeConfig> {
  const backend = getBackend();
  if (!backend) {
    const mem = (memoryFallback.get(CONFIG_KEY) ?? {}) as Partial<RuntimeConfig>;
    return { youtubeApiKey: mem.youtubeApiKey ?? null, youtubeClientId: mem.youtubeClientId ?? null };
  }
  const res = await backend.get(CONFIG_KEY);
  const cfg = (res[CONFIG_KEY] ?? {}) as Partial<RuntimeConfig>;
  return { youtubeApiKey: cfg.youtubeApiKey ?? null, youtubeClientId: cfg.youtubeClientId ?? null };
}

export async function saveConfig(cfg: RuntimeConfig): Promise<void> {
  const backend = getBackend();
  if (!backend) {
    memoryFallback.set(CONFIG_KEY, cfg);
    return;
  }
  await backend.set({ [CONFIG_KEY]: cfg });
}

export async function clearConfig(): Promise<void> {
  await saveConfig({ youtubeApiKey: null, youtubeClientId: null });
}
