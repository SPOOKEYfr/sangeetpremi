import { describe, expect, it } from 'vitest';
import { MusicBrainzError } from '../src/services/musicbrainz/index';
import {
  BOHEMIAN_RECORDING_MBID,
  EMPTY_MBID,
  YELLOW_MUSIC_VIDEO_URL,
  YELLOW_RECORDING_MBID,
  YELLOW_RELATIONSHIPS_RESPONSE,
  YELLOW_VIDEO_ID,
  YELLOW_VIDEO_URL,
  catalogueHandler,
  createClientHarness,
  jsonResponse,
} from './musicbrainzHarness';

/**
 * The GUI's old static preview catalogue used this recording MBID for Yellow
 * together with `verified: true` and video `yKNxeF4KMsY`. The real
 * MusicBrainz recording does not exist at this MBID, so no lookup can turn the
 * hardcoded flag into verification.
 */
const RC1_HARDCODED_YELLOW_MBID = '6f5b9d21-f093-4e02-b258-73595561b36e';
const RC1_HARDCODED_VIDEO_ID = 'yKNxeF4KMsY';

const COLDPLAY_CREDIT = YELLOW_RELATIONSHIPS_RESPONSE['artist-credit'];

function recordingResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: YELLOW_RECORDING_MBID,
    title: 'Yellow',
    length: 269_120,
    'first-release-date': '2000-06-26',
    isrcs: ['GBAYE0000267'],
    'artist-credit': COLDPLAY_CREDIT,
    ...overrides,
  };
}

function relationsResponse(relations: unknown) {
  return recordingResponse({ relations });
}

describe('MusicBrainz client — recording YouTube relationships', () => {
  it('verifies Yellow only from the exact recording URL relationship', async () => {
    const harness = createClientHarness(catalogueHandler);

    const result = await harness.client.getRecordingYouTubeRelationship(
      YELLOW_RECORDING_MBID,
    );

    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0].url.pathname).toBe(
      `/ws/2/recording/${YELLOW_RECORDING_MBID}`,
    );
    expect(harness.requests[0].url.searchParams.get('inc')).toBe(
      'url-rels+artist-credits+isrcs',
    );
    expect(result).toEqual({
      recordingMBID: YELLOW_RECORDING_MBID,
      recordingTitle: 'Yellow',
      artistCredit: ['Coldplay'],
      lengthSeconds: 269,
      isrc: 'GBAYE0000267',
      relationshipUrl: YELLOW_VIDEO_URL,
      relationshipType: 'free streaming',
      relationshipDirection: 'forward',
      source: 'musicbrainz',
      verificationStatus: 'verified',
      verified: true,
      youtubeVideoId: YELLOW_VIDEO_ID,
      youtubeUrl: YELLOW_VIDEO_URL,
    });
  });

  it('does not let a caller-supplied ID or title establish verification', async () => {
    const harness = createClientHarness(() =>
      jsonResponse(relationsResponse([])),
    );

    const result = await harness.client.getRecordingYouTubeRelationship(
      YELLOW_RECORDING_MBID,
    );

    expect(result.verificationStatus).toBe('unmapped');
    expect(result.verified).toBe(false);
    expect(result.recordingTitle).toBe('Yellow');
    expect(result.artistCredit).toEqual(['Coldplay']);
    expect(result.youtubeVideoId).toBeNull();
    expect(result.youtubeUrl).toBeNull();
  });

  it('returns unmapped with no destination when Yellow has no relationships', async () => {
    const harness = createClientHarness(() => jsonResponse(recordingResponse()));

    const result = await harness.client.getRecordingYouTubeRelationship(
      YELLOW_RECORDING_MBID,
    );

    expect(result.verificationStatus).toBe('unmapped');
    expect(result.verified).toBe(false);
    expect(result.recordingMBID).toBe(YELLOW_RECORDING_MBID);
    expect(result.recordingTitle).toBe('Yellow');
    expect(result.artistCredit).toEqual(['Coldplay']);
    expect(result.relationshipUrl).toBeNull();
    expect(result.relationshipType).toBeNull();
    expect(result.relationshipDirection).toBeNull();
    expect(result.source).toBe('musicbrainz');
    expect(result.youtubeVideoId).toBeNull();
    expect(result.youtubeUrl).toBeNull();
  });

  it('rejects an invalid recording MBID before making a request', async () => {
    const harness = createClientHarness(catalogueHandler);

    const result = await harness.client.getRecordingYouTubeRelationship(
      'not-a-recording-mbid',
    );

    expect(result).toEqual({
      recordingMBID: 'not-a-recording-mbid',
      relationshipUrl: null,
      relationshipType: null,
      relationshipDirection: null,
      source: 'musicbrainz',
      verificationStatus: 'invalid-mbid',
      verified: false,
      youtubeVideoId: null,
      youtubeUrl: null,
    });
    expect(harness.requests).toHaveLength(0);
  });

  it('returns recording-not-found for a well-formed but unknown MBID', async () => {
    const harness = createClientHarness(() => new Response('', { status: 404 }));

    const result = await harness.client.getRecordingYouTubeRelationship(EMPTY_MBID);

    expect(result.verificationStatus).toBe('recording-not-found');
    expect(result.verified).toBe(false);
    expect(result.youtubeVideoId).toBeNull();
    expect(result.youtubeUrl).toBeNull();
    expect(harness.requests).toHaveLength(1);
  });

  it('cannot verify the RC1 hardcoded Yellow MBID or its video ID', async () => {
    const harness = createClientHarness(catalogueHandler);

    const result = await harness.client.getRecordingYouTubeRelationship(
      RC1_HARDCODED_YELLOW_MBID,
    );

    expect(result.verificationStatus).toBe('recording-not-found');
    expect(result.verified).toBe(false);
    expect(result.youtubeVideoId).not.toBe(RC1_HARDCODED_VIDEO_ID);
    expect(result.youtubeVideoId).toBeNull();
    expect(result.youtubeUrl).toBeNull();
  });

  it('ignores unrelated destinations and non-playback relationship types', async () => {
    const harness = createClientHarness(() =>
      jsonResponse(
        relationsResponse([
          {
            type: 'free streaming',
            direction: 'forward',
            url: { resource: 'https://open.spotify.com/track/3AJwUDP919kvQ9QcozQPxg' },
          },
          {
            type: 'free streaming',
            direction: 'forward',
            url: { resource: 'https://www.deezer.com/track/3128096' },
          },
          {
            type: 'free streaming',
            direction: 'forward',
            url: { resource: 'https://example.com/watch?v=9qnqYL0eNNI' },
          },
          {
            type: 'official homepage',
            direction: 'forward',
            url: { resource: YELLOW_VIDEO_URL },
          },
          {
            type: 'purchase for download',
            direction: 'forward',
            url: { resource: YELLOW_MUSIC_VIDEO_URL },
          },
        ]),
      ),
    );

    const result = await harness.client.getRecordingYouTubeRelationship(
      YELLOW_RECORDING_MBID,
    );

    expect(result.verificationStatus).toBe('unmapped');
    expect(result.verified).toBe(false);
    expect(result.relationshipUrl).toBeNull();
    expect(result.youtubeVideoId).toBeNull();
    expect(result.youtubeUrl).toBeNull();
  });

  it.each([
    ['a bare video ID', YELLOW_VIDEO_ID],
    ['a short video ID', 'https://www.youtube.com/watch?v=not-an-id'],
    ['a search URL', 'https://www.youtube.com/results?search_query=9qnqYL0eNNI'],
    ['a channel URL', 'https://www.youtube.com/channel/UC1234567890'],
    ['a missing short-link ID', 'https://youtu.be/'],
    ['extra short-link path segments', 'https://youtu.be/9qnqYL0eNNI/extra'],
    [
      'duplicate v parameters',
      'https://www.youtube.com/watch?v=9qnqYL0eNNI&v=aaaaaaaaaaa',
    ],
    ['a missing v parameter', 'https://www.youtube.com/watch'],
    [
      'URL credentials',
      'https://user:pass@www.youtube.com/watch?v=9qnqYL0eNNI',
    ],
    [
      'a nonstandard port',
      'https://www.youtube.com:8443/watch?v=9qnqYL0eNNI',
    ],
    [
      'a lookalike host',
      'https://www.youtube.com.evil.example/watch?v=9qnqYL0eNNI',
    ],
    ['a non-YouTube host', 'https://notyoutube.com/watch?v=9qnqYL0eNNI'],
    ['a non-HTTP scheme', 'javascript:alert(1)'],
    ['a malformed URL', 'not a url'],
  ])('does not verify from %s', async (_label, resource) => {
    const harness = createClientHarness(() =>
      jsonResponse(
        relationsResponse([
          { type: 'free streaming', direction: 'forward', url: { resource } },
        ]),
      ),
    );

    const result = await harness.client.getRecordingYouTubeRelationship(
      YELLOW_RECORDING_MBID,
    );

    expect(result.verificationStatus).toBe('unmapped');
    expect(result.verified).toBe(false);
    expect(result.youtubeVideoId).toBeNull();
  });

  it('canonicalizes a YouTube Music relationship to a YouTube watch URL', async () => {
    const harness = createClientHarness(() =>
      jsonResponse(
        relationsResponse([
          {
            type: 'free streaming',
            direction: 'forward',
            url: { resource: YELLOW_MUSIC_VIDEO_URL },
          },
        ]),
      ),
    );

    const result = await harness.client.getRecordingYouTubeRelationship(
      YELLOW_RECORDING_MBID,
    );

    expect(result.verificationStatus).toBe('verified');
    expect(result.relationshipUrl).toBe(YELLOW_MUSIC_VIDEO_URL);
    expect(result.youtubeVideoId).toBe(YELLOW_VIDEO_ID);
    expect(result.youtubeUrl).toBe(YELLOW_VIDEO_URL);
  });

  it('accepts a youtu.be relationship attached to the exact recording', async () => {
    const harness = createClientHarness(() =>
      jsonResponse(
        relationsResponse([
          {
            type: 'streaming',
            direction: 'forward',
            url: { resource: `https://youtu.be/${YELLOW_VIDEO_ID}` },
          },
        ]),
      ),
    );

    const result = await harness.client.getRecordingYouTubeRelationship(
      YELLOW_RECORDING_MBID,
    );

    expect(result.verificationStatus).toBe('verified');
    expect(result.relationshipType).toBe('streaming');
    expect(result.youtubeVideoId).toBe(YELLOW_VIDEO_ID);
    expect(result.youtubeUrl).toBe(YELLOW_VIDEO_URL);
  });

  it('throws when the relationships field is malformed', async () => {
    const harness = createClientHarness(() =>
      jsonResponse(relationsResponse({ not: 'an array' })),
    );

    const error = await harness.client
      .getRecordingYouTubeRelationship(YELLOW_RECORDING_MBID)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) {
      expect(error.message).toMatch(/malformed recording relationships/i);
    }
  });

  it('throws when a relationship entry is structurally malformed', async () => {
    const harness = createClientHarness(() =>
      jsonResponse(relationsResponse([{ type: 'free streaming' }])),
    );

    const error = await harness.client
      .getRecordingYouTubeRelationship(YELLOW_RECORDING_MBID)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) {
      expect(error.message).toMatch(/malformed recording relationship/i);
    }
  });

  it('throws when MusicBrainz returns a different recording MBID', async () => {
    const harness = createClientHarness(() =>
      jsonResponse(
        recordingResponse({
          id: BOHEMIAN_RECORDING_MBID,
          relations: [
            {
              type: 'free streaming',
              direction: 'forward',
              url: { resource: YELLOW_VIDEO_URL },
            },
          ],
        }),
      ),
    );

    const error = await harness.client
      .getRecordingYouTubeRelationship(YELLOW_RECORDING_MBID)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) {
      expect(error.message).toMatch(/invalid recording lookup response/i);
    }
  });

  it('throws when the recording metadata is missing a title', async () => {
    const harness = createClientHarness(() =>
      jsonResponse({ id: YELLOW_RECORDING_MBID }),
    );

    const error = await harness.client
      .getRecordingYouTubeRelationship(YELLOW_RECORDING_MBID)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) {
      expect(error.message).toMatch(/invalid recording lookup response/i);
    }
  });

  it('throws for malformed JSON without retrying', async () => {
    const harness = createClientHarness(
      () =>
        new Response('{"id": "', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const error = await harness.client
      .getRecordingYouTubeRelationship(YELLOW_RECORDING_MBID)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) {
      expect(error.message).toMatch(/malformed JSON/i);
    }
    expect(harness.requests).toHaveLength(1);
    expect(harness.sleeps).toEqual([]);
  });

  it('surfaces non-404 API failures as MusicBrainzError', async () => {
    const harness = createClientHarness(() => new Response('server error', { status: 500 }));

    const error = await harness.client
      .getRecordingYouTubeRelationship(YELLOW_RECORDING_MBID)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) {
      expect(error.status).toBe(500);
      expect(error.message).toContain('HTTP 500');
    }
    expect(harness.requests).toHaveLength(1);
    expect(harness.sleeps).toEqual([]);
  });

  it('preserves the existing 503 retry and backoff policy', async () => {
    const harness = createClientHarness(
      () => new Response('busy', { status: 503 }),
      { maxRetries: 1 },
    );

    const error = await harness.client
      .getRecordingYouTubeRelationship(YELLOW_RECORDING_MBID)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) expect(error.status).toBe(503);
    expect(harness.requests).toHaveLength(2);
    expect(harness.sleeps).toEqual([1000]);
  });
});
