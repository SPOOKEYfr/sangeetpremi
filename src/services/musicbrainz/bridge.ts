/**
 * UI-side bridge to the background-owned MusicBrainz client.
 *
 * In an extension context every method sends a narrow message to the service
 * worker. The service worker's single client serializes the requests, so the
 * dashboard and side-panel iframe share one 1-request/second scheduler.
 *
 * In a plain Node/test context with no extension runtime, the bridge falls
 * back to an isolated direct client. Tests that care about scheduling inject
 * the background router explicitly.
 */
import {
  MusicBrainzError,
  createMusicBrainzClient,
  type MusicBrainzClient,
} from './index';
import {
  MUSICBRAINZ_REQUEST_TYPE,
  isMusicBrainzResponse,
  type MusicBrainzOperation,
  type MusicBrainzParams,
  type MusicBrainzRequest,
  type MusicBrainzResponse,
  type MusicBrainzResult,
} from './protocol';

export interface MusicBrainzMessageTransport {
  sendMessage(
    message: MusicBrainzRequest,
    callback: (response: MusicBrainzResponse | undefined) => void,
  ): void;
  /** Chrome's runtime.lastError surface. */
  getLastError?(): string | undefined;
}

export interface MusicBrainzBridgeOptions {
  /** Milliseconds before a message with no response is treated as failed. */
  timeoutMs?: number;
}

let requestSequence = 0;

function nextRequestId(): string {
  requestSequence += 1;
  return `mb-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

/**
 * Build a bridge over a transport. The transport is injectable so the same
 * message routing can be exercised without a browser runtime.
 */
export function createMusicBrainzBridge(
  transport: MusicBrainzMessageTransport,
  options: MusicBrainzBridgeOptions = {},
): MusicBrainzClient {
  const timeoutMs = Math.max(1, options.timeoutMs ?? 60_000);

  function request<K extends MusicBrainzOperation>(
    operation: K,
    params: MusicBrainzParams<K>,
  ): Promise<MusicBrainzResult<K>> {
    return new Promise<MusicBrainzResult<K>>((resolve, reject) => {
      const requestId = nextRequestId();
      let settled = false;

      const timer = setTimeout(() => {
        finish(new MusicBrainzError('MusicBrainz background request timed out.'));
      }, timeoutMs);

      function finish(error: Error | null, result?: MusicBrainzResult<K>): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result as MusicBrainzResult<K>);
      }

      try {
        transport.sendMessage(
          {
            type: MUSICBRAINZ_REQUEST_TYPE,
            requestId,
            operation,
            params,
          } as MusicBrainzRequest,
          (response) => {
            const lastError = transport.getLastError?.();
            if (lastError) {
              finish(new MusicBrainzError(`MusicBrainz background request failed: ${lastError}`));
              return;
            }
            if (!response) {
              finish(new MusicBrainzError('MusicBrainz background worker returned no response.'));
              return;
            }
            if (!isMusicBrainzResponse(response) || response.requestId !== requestId) {
              finish(new MusicBrainzError('MusicBrainz background worker returned a mismatched response.'));
              return;
            }
            if (!response.ok) {
              finish(
                new MusicBrainzError(
                  response.error.message,
                  response.error.status,
                  response.error.retryAfterMs,
                ),
              );
              return;
            }
            finish(null, response.result as MusicBrainzResult<K>);
          },
        );
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new MusicBrainzError('MusicBrainz background request failed.'),
        );
      }
    });
  }

  return {
    searchArtists(name, limit) {
      return request(
        'searchArtists',
        limit === undefined ? { name } : { name, limit },
      );
    },
    getArtistByMBID(mbid, inc) {
      return request('getArtistByMBID', inc === undefined ? { mbid } : { mbid, inc });
    },
    getReleaseGroupsByArtistMBID(artistMBID, inc, limit) {
      return request('getReleaseGroupsByArtistMBID', {
        artistMBID,
        ...(inc === undefined ? {} : { inc }),
        ...(limit === undefined ? {} : { limit }),
      });
    },
    getRecordingsByArtistMBID(artistMBID, inc, limit) {
      return request('getRecordingsByArtistMBID', {
        artistMBID,
        ...(inc === undefined ? {} : { inc }),
        ...(limit === undefined ? {} : { limit }),
      });
    },
    getRecordingsByReleaseGroupMBID(releaseGroupMBID, inc, limit) {
      return request('getRecordingsByReleaseGroupMBID', {
        releaseGroupMBID,
        ...(inc === undefined ? {} : { inc }),
        ...(limit === undefined ? {} : { limit }),
      });
    },
    getCoverArtArchive(recordingMBID) {
      return request('getCoverArtArchive', { recordingMBID });
    },
    getCoverArtArchiveByReleaseGroupMBID(releaseGroupMBID) {
      return request('getCoverArtArchiveByReleaseGroupMBID', { releaseGroupMBID });
    },
    getArtistCreditsForReleaseGroup(releaseGroupMBID) {
      return request('getArtistCreditsForReleaseGroup', { releaseGroupMBID });
    },
  };
}

function defaultTransport(): MusicBrainzMessageTransport | null {
  if (
    typeof chrome === 'undefined' ||
    typeof chrome.runtime?.sendMessage !== 'function'
  ) {
    return null;
  }

  return {
    sendMessage(message, callback) {
      chrome.runtime.sendMessage(message, (response: unknown) => {
        callback(response as MusicBrainzResponse | undefined);
      });
    },
    getLastError() {
      try {
        return chrome.runtime.lastError?.message;
      } catch {
        return undefined;
      }
    },
  };
}

let uiClient: MusicBrainzClient | null = null;

/**
 * The client UI modules should use. Extension contexts always route through
 * the background; the direct fallback exists only for non-extension dev/test.
 */
export function getUiMusicBrainzClient(): MusicBrainzClient {
  if (uiClient) return uiClient;
  const transport = defaultTransport();
  uiClient = transport
    ? createMusicBrainzBridge(transport)
    : createMusicBrainzClient();
  return uiClient;
}
