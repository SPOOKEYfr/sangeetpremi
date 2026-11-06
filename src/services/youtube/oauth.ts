/**
 * Optional OAuth 2.0 flow for "Create playlist on YouTube".
 *
 * Uses chrome.identity.launchWebAuthFlow with the implicit grant.
 * Requires a "Chrome Extension" OAuth client id configured in Google Cloud
 * Console (see docs/SETUP_YOUTUBE_API.md). The client id is NOT a secret for
 * installed-app flows and is supplied at runtime by the user/developer via
 * Settings — it is never hardcoded here.
 */
import { loadConfig } from '../config';

const SCOPES = ['https://www.googleapis.com/auth/youtube'];
const TOKEN_KEY = 'sangeetpremi.oauthToken';

export interface OAuthToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

export async function getValidToken(): Promise<string | null> {
  const stored = await readToken();
  if (stored && stored.expiresAt > Date.now() + 60_000) return stored.accessToken;
  return null;
}

async function readToken(): Promise<OAuthToken | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
  const res = await chrome.storage.local.get(TOKEN_KEY);
  return (res[TOKEN_KEY] as OAuthToken) ?? null;
}

async function writeToken(token: OAuthToken | null): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  if (token) await chrome.storage.local.set({ [TOKEN_KEY]: token });
  else await chrome.storage.local.remove(TOKEN_KEY);
}

/** Launch the interactive OAuth flow. Returns an access token or null if not configured/cancelled. */
export async function authorize(): Promise<string | null> {
  const cfg = await loadConfig();
  if (!cfg.youtubeClientId) {
    throw new Error('YouTube OAuth client id is not configured. Add it in Settings (see docs/SETUP_YOUTUBE_API.md).');
  }
  if (typeof chrome === 'undefined' || !chrome.identity?.launchWebAuthFlow) {
    throw new Error('OAuth is only available inside the browser extension.');
  }
  const redirectUri = chrome.identity.getRedirectURL('oauth2');
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${encodeURIComponent(cfg.youtubeClientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(SCOPES.join(' '))}` +
    `&prompt=consent`;

  const responseUrl: string | undefined = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (url) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(url);
    });
  });
  if (!responseUrl) return null;
  const hash = new URL(responseUrl).hash.slice(1);
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const expiresIn = Number(params.get('expires_in') ?? 3600);
  if (!accessToken) throw new Error('OAuth did not return an access token.');
  const token: OAuthToken = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  await writeToken(token);
  return accessToken;
}

export async function revoke(): Promise<void> {
  const token = await getValidToken();
  if (token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`);
    } catch {
      // Revocation is best-effort; local token is cleared regardless.
    }
  }
  await writeToken(null);
}

export async function isAuthorized(): Promise<boolean> {
  return (await getValidToken()) !== null;
}
