/**
 * Background-owned MusicBrainz routing for MV3.
 *
 * All UI contexts (dashboard, popup, side-panel iframe) send messages to this
 * module. The background service worker owns the only MusicBrainz client, so
 * the client's queue and 1-request/second clock are shared across contexts.
 *
 * The listener is registered at service-worker module evaluation time. When
 * MV3 suspends and later wakes the worker, the module is evaluated again and
 * the listener is re-registered; in-flight requests are held open by returning
 * true from the runtime listener.
 */
import {
  MusicBrainzError,
  getSharedMusicBrainzClient,
  type MusicBrainzClient,
} from './index';
import {
  MUSICBRAINZ_REQUEST_TYPE,
  MUSICBRAINZ_RESPONSE_TYPE,
  isMusicBrainzRequest,
  type MusicBrainzErrorPayload,
  type MusicBrainzRequest,
  type MusicBrainzResponse,
} from './protocol';

export interface MessageSenderLike {
  id?: string;
  url?: string;
}

export type RuntimeMessageListener = (
  message: unknown,
  sender: MessageSenderLike,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

export interface RuntimeLike {
  id?: string;
  onMessage: {
    addListener(listener: RuntimeMessageListener): void;
    removeListener?(listener: RuntimeMessageListener): void;
  };
}

export interface BackgroundRegistrationOptions {
  /** Client injected by tests; defaults to the shared background client. */
  client?: MusicBrainzClient;
  /** Runtime injected by tests; defaults to `chrome.runtime`. */
  runtime?: RuntimeLike;
}

function readString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid MusicBrainz request: "${key}" must be a non-empty string.`);
  }
  return value;
}

function readOptionalString(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid MusicBrainz request: "${key}" must be a non-empty string.`);
  }
  return value;
}

function readOptionalNumber(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid MusicBrainz request: "${key}" must be a finite number.`);
  }
  return value;
}

function serializeError(error: unknown): MusicBrainzErrorPayload {
  if (error instanceof MusicBrainzError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      retryAfterMs: error.retryAfterMs,
    };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'Error', message: 'MusicBrainz request failed.' };
}

async function dispatch(
  client: MusicBrainzClient,
  request: MusicBrainzRequest,
): Promise<unknown> {
  const params = request.params as Record<string, unknown>;

  switch (request.operation) {
    case 'searchArtists':
      return client.searchArtists(
        readString(params, 'name'),
        readOptionalNumber(params, 'limit'),
      );
    case 'getArtistByMBID':
      return client.getArtistByMBID(
        readString(params, 'mbid'),
        readOptionalString(params, 'inc'),
      );
    case 'getReleaseGroupsByArtistMBID':
      return client.getReleaseGroupsByArtistMBID(
        readString(params, 'artistMBID'),
        readOptionalString(params, 'inc'),
        readOptionalNumber(params, 'limit'),
      );
    case 'getRecordingsByArtistMBID':
      return client.getRecordingsByArtistMBID(
        readString(params, 'artistMBID'),
        readOptionalString(params, 'inc'),
        readOptionalNumber(params, 'limit'),
      );
    case 'getRecordingsByReleaseGroupMBID':
      return client.getRecordingsByReleaseGroupMBID(
        readString(params, 'releaseGroupMBID'),
        readOptionalString(params, 'inc'),
        readOptionalNumber(params, 'limit'),
      );
    case 'getCoverArtArchive':
      return client.getCoverArtArchive(readString(params, 'recordingMBID'));
    case 'getCoverArtArchiveByReleaseGroupMBID':
      return client.getCoverArtArchiveByReleaseGroupMBID(
        readString(params, 'releaseGroupMBID'),
      );
    case 'getArtistCreditsForReleaseGroup':
      return client.getArtistCreditsForReleaseGroup(
        readString(params, 'releaseGroupMBID'),
      );
    case 'getRecordingYouTubeRelationship':
      return client.getRecordingYouTubeRelationship(
        readString(params, 'recordingMBID'),
      );
    default: {
      const exhaustive: never = request;
      throw new Error(`Unsupported MusicBrainz operation: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Create the pure request handler used by the runtime listener. It returns
 * `undefined` for unrelated messages so other service-worker listeners can
 * handle them.
 */
export function createMusicBrainzRequestHandler(
  client: MusicBrainzClient,
): (message: unknown) => Promise<MusicBrainzResponse | undefined> {
  return async (message: unknown) => {
    if (!isMusicBrainzRequest(message)) return undefined;

    try {
      const result = await dispatch(client, message);
      return {
        type: MUSICBRAINZ_RESPONSE_TYPE,
        requestId: message.requestId,
        ok: true,
        result,
      };
    } catch (error) {
      return {
        type: MUSICBRAINZ_RESPONSE_TYPE,
        requestId: message.requestId,
        ok: false,
        error: serializeError(error),
      };
    }
  };
}

function defaultRuntime(): RuntimeLike | null {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return null;
  return chrome.runtime as unknown as RuntimeLike;
}

/**
 * Register the single background message route. Returns an unsubscribe
 * function (useful for tests and deterministic teardown).
 */
export function registerMusicBrainzBackgroundHandler(
  options: BackgroundRegistrationOptions = {},
): () => void {
  const runtime = options.runtime ?? defaultRuntime();
  if (!runtime) {
    throw new Error('MusicBrainz background handler requires a runtime.');
  }

  const client = options.client ?? getSharedMusicBrainzClient();
  const handle = createMusicBrainzRequestHandler(client);

  const listener: RuntimeMessageListener = (message, sender, sendResponse) => {
    if (!isMusicBrainzRequest(message)) return false;

    // Only extension-owned contexts may use the shared scheduler.
    if (sender.id && runtime.id && sender.id !== runtime.id) {
      const response: MusicBrainzResponse = {
        type: MUSICBRAINZ_RESPONSE_TYPE,
        requestId: message.requestId,
        ok: false,
        error: {
          name: 'MusicBrainzError',
          message: 'MusicBrainz requests must come from this extension.',
        },
      };
      sendResponse(response);
      return false;
    }

    void handle(message).then((response) => {
      if (response) sendResponse(response);
    });

    // Keep the MV3 message channel alive until the async operation settles.
    return true;
  };

  runtime.onMessage.addListener(listener);

  return () => {
    runtime.onMessage.removeListener?.(listener);
  };
}

export { MUSICBRAINZ_REQUEST_TYPE };
