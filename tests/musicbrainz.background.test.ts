import { afterEach, describe, expect, it } from 'vitest';
import {
  createMusicBrainzRequestHandler,
  registerMusicBrainzBackgroundHandler,
  type RuntimeLike,
  type RuntimeMessageListener,
} from '../src/services/musicbrainz/background';
import { createMusicBrainzBridge } from '../src/services/musicbrainz/bridge';
import {
  MusicBrainzError,
  type MusicBrainzClient,
} from '../src/services/musicbrainz/index';
import {
  MUSICBRAINZ_RESPONSE_TYPE,
  type MusicBrainzRequest,
  type MusicBrainzResponse,
} from '../src/services/musicbrainz/protocol';
import {
  QUEEN_MBID,
  catalogueHandler,
  createClientHarness,
} from './musicbrainzHarness';

interface TestRuntime extends RuntimeLike {
  sendMessage(
    message: unknown,
    callback: (response: MusicBrainzResponse | undefined) => void,
  ): void;
  invoke(
    message: unknown,
    senderId: string,
    callback: (response: MusicBrainzResponse | undefined) => void,
  ): void;
}

/**
 * Minimal in-memory stand-in for chrome.runtime. Both UI bridges use the same
 * runtime object, which is exactly what dashboard + side-panel do in MV3.
 */
function createTestRuntime(): TestRuntime {
  const listeners = new Set<RuntimeMessageListener>();

  function invoke(
    message: unknown,
    senderId: string,
    callback: (response: MusicBrainzResponse | undefined) => void,
  ): void {
    queueMicrotask(() => {
      let responded = false;
      let keepAlive = false;
      const sendResponse = (response?: unknown) => {
        if (responded) return;
        responded = true;
        callback(response as MusicBrainzResponse | undefined);
      };
      for (const listener of [...listeners]) {
        const result = listener(message, { id: senderId }, sendResponse);
        if (result === true) keepAlive = true;
      }
      if (!keepAlive && !responded) callback(undefined);
    });
  }

  return {
    id: 'test-extension-id',
    onMessage: {
      addListener(listener) {
        listeners.add(listener);
      },
      removeListener(listener) {
        listeners.delete(listener);
      },
    },
    sendMessage(message, callback) {
      invoke(message, 'test-extension-id', callback);
    },
    invoke,
  };
}

function bridgeFor(runtime: TestRuntime): MusicBrainzClient {
  return createMusicBrainzBridge(
    {
      sendMessage(message, callback) {
        runtime.sendMessage(message, callback);
      },
      getLastError: () => undefined,
    },
    { timeoutMs: 5_000 },
  );
}

let unregister: (() => void) | undefined;
afterEach(() => {
  unregister?.();
  unregister = undefined;
});

describe('MusicBrainz background routing', () => {
  it('serves two UI contexts through one shared scheduler', async () => {
    const harness = createClientHarness(catalogueHandler);
    const runtime = createTestRuntime();
    unregister = registerMusicBrainzBackgroundHandler({
      runtime,
      client: harness.client,
    });

    const dashboard = bridgeFor(runtime);
    const sidePanel = bridgeFor(runtime);

    const [artists, groups] = await Promise.all([
      dashboard.searchArtists('Queen'),
      sidePanel.getReleaseGroupsByArtistMBID(QUEEN_MBID),
    ]);

    expect(artists[0]).toMatchObject({ id: QUEEN_MBID, name: 'Queen' });
    expect(groups).toHaveLength(2);
    expect(harness.requests).toHaveLength(2);
    expect(harness.requests.map((request) => request.url.pathname)).toEqual([
      '/ws/2/artist',
      '/ws/2/release-group',
    ]);
    // The background client's single queue enforces the shared interval.
    expect(harness.requests.map((request) => request.at)).toEqual([0, 1000]);
  });

  it('keeps the message channel open until the async response arrives', async () => {
    const harness = createClientHarness(catalogueHandler);
    const runtime = createTestRuntime();
    unregister = registerMusicBrainzBackgroundHandler({
      runtime,
      client: harness.client,
    });
    const bridge = bridgeFor(runtime);

    await expect(bridge.getArtistByMBID(QUEEN_MBID)).resolves.toMatchObject({
      id: QUEEN_MBID,
      name: 'Queen',
    });
    // A second request proves the listener remains registered after the first.
    await expect(bridge.searchArtists('Queen')).resolves.toHaveLength(2);
    expect(harness.requests).toHaveLength(2);
  });

  it('serializes errors back to the UI with status and retry metadata', async () => {
    const harness = createClientHarness(catalogueHandler);
    const failingClient: MusicBrainzClient = {
      ...harness.client,
      async searchArtists() {
        throw new MusicBrainzError('MusicBrainz is unavailable', 503, 2_000);
      },
    };
    const runtime = createTestRuntime();
    unregister = registerMusicBrainzBackgroundHandler({
      runtime,
      client: failingClient,
    });
    const bridge = bridgeFor(runtime);

    const error = await bridge.searchArtists('Queen').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) {
      expect(error.message).toBe('MusicBrainz is unavailable');
      expect(error.status).toBe(503);
      expect(error.retryAfterMs).toBe(2_000);
    }
  });

  it('ignores unrelated messages and returns no handler response', async () => {
    const harness = createClientHarness(catalogueHandler);
    const handle = createMusicBrainzRequestHandler(harness.client);

    await expect(handle({ type: 'sangeetpremi:open-dashboard' })).resolves.toBeUndefined();
    expect(harness.requests).toHaveLength(0);
  });

  it('rejects requests that do not come from this extension', async () => {
    const harness = createClientHarness(catalogueHandler);
    const runtime = createTestRuntime();
    unregister = registerMusicBrainzBackgroundHandler({
      runtime,
      client: harness.client,
    });

    const request: MusicBrainzRequest = {
      type: 'sangeetpremi:musicbrainz:request',
      requestId: 'foreign-1',
      operation: 'searchArtists',
      params: { name: 'Queen' },
    };

    const response = await new Promise<MusicBrainzResponse | undefined>((resolve) => {
      runtime.invoke(request, 'foreign-extension', resolve);
    });

    expect(response).toMatchObject({
      type: MUSICBRAINZ_RESPONSE_TYPE,
      requestId: 'foreign-1',
      ok: false,
      error: {
        message: 'MusicBrainz requests must come from this extension.',
      },
    });
    expect(harness.requests).toHaveLength(0);
  });
});
