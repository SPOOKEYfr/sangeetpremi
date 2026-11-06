/**
 * Phase C1 provider tests — fully mocked transports, no live API calls,
 * no real credentials.
 */
import { describe, it, expect } from 'vitest';
import { YouTubeVideoProvider, YouTubeProviderError } from '../src/providers/youtube.js';
import { MusicBrainzProvider, USER_AGENT } from '../src/providers/musicbrainz.js';
import { InMemoryQuotaAccountant, QuotaExhausted } from '../src/quota.js';
import { NullSecretProvider, EnvSecretProvider } from '../src/secrets.js';
import type { Transport, TransportResponse } from '../src/http/transport.js';

// ---------- mock transport helpers ----------
function jsonRes(status: number, body: unknown): TransportResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function textRes(status: number, text: string): TransportResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text), text: async () => text };
}
function mockTransport(handler: (url: string) => TransportResponse | Promise<TransportResponse>): { t: Transport; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    t: async (url) => {
      calls.push(url);
      return handler(url);
    },
  };
}
const sleep0 = async () => {};
const TEST_KEY = 'TESTKEY-abcdefgh12345678';

function ytProvider(handler: (url: string) => TransportResponse | Promise<TransportResponse>, quota?: InMemoryQuotaAccountant) {
  const mock = mockTransport(handler);
  const q = quota ?? new InMemoryQuotaAccountant();
  const p = new YouTubeVideoProvider({
    secrets: new EnvSecretProvider({ YOUTUBE_API_KEY: TEST_KEY }),
    quota: q,
    transport: mock.t,
  });
  return { p, calls: mock.calls, q };
}

const searchFixture = {
  items: [
    { id: { videoId: 'dQw4w9WgXcQ' }, snippet: { title: 'Rick Astley - Never Gonna Give You Up', channelId: 'UCuAXFkgsw1Lo7', channelTitle: 'Rick Astley', publishedAt: '2009-10-25T00:00:00Z', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' } } } },
    { id: { videoId: 'abcDEF12345' }, snippet: { title: 'Some Other Song', channelId: 'UCxxxxxxxx', channelTitle: 'Other', publishedAt: '2020-01-01T00:00:00Z' } },
    { id: { videoId: 'bad id!' }, snippet: { title: 'invalid id filtered out' } },
  ],
  nextPageToken: 'PAGE2',
};
const videosFixture = {
  items: [
    { id: 'dQw4w9WgXcQ', snippet: { title: 'Never Gonna Give You Up', channelId: 'UCuAXFkgsw1Lo7', channelTitle: 'Rick Astley', publishedAt: '2009-10-25T00:00:00Z', thumbnails: { high: { url: 'hq.jpg' } } }, contentDetails: { duration: 'PT3M33S' }, statistics: { viewCount: '1500000000' } },
  ],
};
const channelsFixture = {
  items: [
    { id: 'UCuAXFkgsw1Lo7', snippet: { title: 'Rick Astley', description: 'Official', country: 'GB', thumbnails: { default: { url: 'c.jpg' } } }, contentDetails: { relatedPlaylists: { uploads: 'UUuAXFkgsw1Lo7' } }, statistics: { subscriberCount: '4000000' } },
  ],
};
const playlistItemsFixture = (page: number) => ({
  items: Array.from({ length: 2 }, (_, i) => ({ snippet: { resourceId: { videoId: `p${page}${i}AAAAAAAA` }, title: `Up ${page}-${i}` } })),
  nextPageToken: page < 3 ? `P${page + 1}` : undefined,
});

describe('YouTubeVideoProvider', () => {
  it('searchVideos: normalizes results, enriches via videos.list, drops invalid ids, returns nextPageToken', async () => {
    const { p, calls, q } = ytProvider((url) => {
      if (url.includes('/search')) return jsonRes(200, searchFixture);
      if (url.includes('/videos')) return jsonRes(200, videosFixture);
      return jsonRes(404, {});
    });
    const res = await p.searchVideos('rick astley', 25);
    expect(res.nextPageToken).toBe('PAGE2');
    expect(res.items.map((i) => i.videoId)).toEqual(['dQw4w9WgXcQ', 'abcDEF12345']); // invalid id dropped
    const first = res.items[0];
    expect(first.title).toBe('Never Gonna Give You Up'); // from videos.list
    expect(first.durationSeconds).toBe(213);
    expect(first.viewCount).toBe(1_500_000_000);
    expect(first.source).toBe('youtube');
    expect(first.fetchedAt).toBeGreaterThan(0);
    expect(first.expiresAt).toBeGreaterThan(first.fetchedAt);
    // quota: 1 search-bucket call + 1 general call (videos.list)
    expect(q.usage().search).toBe(1);
    expect(q.usage().general).toBe(1);
    expect(calls.some((u) => u.includes('key=' + TEST_KEY))).toBe(true);
  });

  it('pagination: each page charged separately in the search bucket', async () => {
    const { p, q } = ytProvider((url) => url.includes('/search') ? jsonRes(200, { items: [] }) : jsonRes(200, { items: [] }));
    await p.searchVideos('a', 25);
    await p.searchVideos('a', 25, 'PAGE2');
    expect(q.usage().search).toBe(2);
  });

  it('resolveChannel: search type=channel then channels.list; returns uploads playlist id', async () => {
    const { p } = ytProvider((url) => {
      if (url.includes('/search')) return jsonRes(200, { items: [{ id: { channelId: 'UCuAXFkgsw1Lo7' } }] });
      if (url.includes('/channels')) return jsonRes(200, channelsFixture);
      return jsonRes(404, {});
    });
    const res = await p.resolveChannel('rick astley');
    expect(res.length).toBe(1);
    expect(res[0].channelId).toBe('UCuAXFkgsw1Lo7');
    expect(res[0].uploadsPlaylistId).toBe('UUuAXFkgsw1Lo7');
    expect(res[0].country).toBe('GB');
    expect(res[0].source).toBe('youtube');
  });

  it('channelUploads: enumerates uploads playlist pages (1 general unit each) + videos.list enrichment', async () => {
    let page = 0;
    const { p, q } = ytProvider((url) => {
      if (url.includes('/channels')) return jsonRes(200, channelsFixture);
      if (url.includes('/playlistItems')) return jsonRes(200, playlistItemsFixture(++page));
      if (url.includes('/videos')) return jsonRes(200, { items: [] });
      return jsonRes(404, {});
    });
    const res = await p.channelUploads('UCuAXFkgsw1Lo7', 200);
    expect(res.length).toBe(6); // 3 pages x 2 items, deduped
    // quota: channels.list 1 + 3 playlistItems pages + 1 videos.list batch = 5 general
    expect(q.usage().general).toBe(5);
    expect(q.usage().search).toBe(0); // no search-bucket usage
  });

  it('channelUploads returns [] when no uploads playlist (caller falls back to search)', async () => {
    const { p } = ytProvider((url) => url.includes('/channels') ? jsonRes(200, { items: [{ id: 'x', contentDetails: { relatedPlaylists: {} } }] }) : jsonRes(200, { items: [] }));
    expect(await p.channelUploads('x', 100)).toEqual([]);
  });

  it('empty results are handled', async () => {
    const { p } = ytProvider(() => jsonRes(200, { items: [] }));
    expect((await p.searchVideos('nothing', 10)).items).toEqual([]);
    expect(await p.videoDetails([])).toEqual([]);
    expect(await p.resolveChannel('')).toEqual([]);
  });

  it('malformed response (not JSON) -> structured provider error, quota released', async () => {
    const { p, q } = ytProvider(() => textRes(200, '<html>not json</html>'));
    await expect(p.searchVideos('x', 5)).rejects.toThrow(/not valid JSON/);
    expect(q.usage().search).toBe(0); // released
  });

  it('HTTP 500 retried bounded times then structured error; quota released', async () => {
    let n = 0;
    const { p, calls, q } = ytProvider(() => { n++; return jsonRes(500, { error: { message: 'boom' } }); });
    await expect(p.searchVideos('x', 5)).rejects.toThrow(YouTubeProviderError);
    expect(n).toBe(3); // 1 + 2 retries, bounded
    expect(calls.length).toBe(3);
    expect(q.usage().search).toBe(0);
  });

  it('403 quotaExceeded is NOT retried and surfaces as QuotaExhausted', async () => {
    let n = 0;
    const { p } = ytProvider(() => { n++; return jsonRes(403, { error: { errors: [{ reason: 'quotaExceeded' }] } }); });
    await expect(p.searchVideos('x', 5)).rejects.toThrow(QuotaExhausted);
    expect(n).toBe(1);
  });

  it('network failure -> structured 503-ish error after bounded retries', async () => {
    const { p } = ytProvider(() => Promise.reject(new Error('ECONNREFUSED')));
    await expect(p.videoDetails(['dQw4w9WgXcQ'])).rejects.toThrow(/transport failure|network/);
  });

  it('missing API key -> PROVIDER_NOT_CONFIGURED, and no key material anywhere', async () => {
    const p = new YouTubeVideoProvider({ secrets: new NullSecretProvider(), quota: new InMemoryQuotaAccountant(), transport: async () => jsonRes(200, {}) });
    await expect(p.searchVideos('x', 5)).rejects.toThrow(/not configured/);
    const p2 = new YouTubeVideoProvider({ secrets: new EnvSecretProvider({}), quota: new InMemoryQuotaAccountant(), transport: async () => jsonRes(200, {}) });
    await expect(p2.videoDetails(['dQw4w9WgXcQ'])).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
  });

  it('API key is redacted from error messages and never logged', async () => {
    const { p } = ytProvider(() => textRes(400, `key=${TEST_KEY} is invalid`));
    try {
      await p.searchVideos('x', 5);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain(TEST_KEY);
      expect((e as Error).message).toContain('[REDACTED]');
    }
  });

  it('quota reservation prevents concurrent overspend (atomic single-instance)', () => {
    const q = new InMemoryQuotaAccountant({ search: 2, uploads: 100, general: 10_000 });
    q.reserve('search.list');
    q.reserve('search.list');
    expect(() => q.reserve('search.list')).toThrow(QuotaExhausted); // third blocked synchronously
    q.release({ method: 'search.list', bucket: 'search', units: 1 });
    expect(q.usage().search).toBe(1); // reconciled
    q.reserve('search.list'); // now allowed again
    expect(q.usage().search).toBe(2);
  });
});

describe('MusicBrainzProvider', () => {
  const artistFixture = { artists: [{ id: '5447d3c4-1234-4a4b-8f0e-abcdefabcdef', name: 'Arijit Singh', country: 'IN', area: { iso_3166_1: 'IN' }, disambiguation: 'Indian playback singer' }] };
  const recordingsFixture = { recordings: [
    { id: 'rec-mbid-1111', title: 'Tum Hi Ho', date: '2013', releases: [{ title: 'Aashiqui 2', date: '2013-04-08', 'release-group': { title: 'Aashiqui 2' } }] },
    { id: 'rec-mbid-1111', title: 'Tum Hi Ho (duplicate id)', releases: [] }, // dedup by id
    { id: 'rec-mbid-2222', title: 'No date song', releases: [] }, // year omitted, not invented
  ] };

  it('resolveArtist normalizes with MBID provenance, source, timestamps', async () => {
    const mock = mockTransport(() => jsonRes(200, artistFixture));
    const mb = new MusicBrainzProvider({ transport: mock.t, sleep: sleep0, minIntervalMs: 0 });
    const res = await mb.resolveArtist('Arijit Singh');
    expect(res[0].id).toBe('5447d3c4-1234-4a4b-8f0e-abcdefabcdef');
    expect(res[0].name).toBe('Arijit Singh');
    expect(res[0].country).toBe('IN');
    expect(res[0].source).toBe('musicbrainz');
    expect(res[0].expiresAt).toBeGreaterThan(res[0].fetchedAt);
  });

  it('sends descriptive User-Agent on every request', async () => {
    const uas: string[] = [];
    const t: Transport = async (url, init) => { uas.push(init?.headers?.['User-Agent'] ?? ''); return jsonRes(200, artistFixture); };
    const mb = new MusicBrainzProvider({ transport: t, sleep: sleep0, minIntervalMs: 0 });
    await mb.resolveArtist('x');
    expect(uas[0]).toContain('SangeetPremi/');
    expect(uas[0]).toContain('github.com/SPOOKEYfr/sangeetpremi');
  });

  it('enforces ~1 req/s rate limit using injected clock', async () => {
    let t = 0;
    const times: number[] = [];
    const sleeps: number[] = [];
    const mb = new MusicBrainzProvider({
      transport: async () => { times.push(t); return jsonRes(200, { artists: [] }); },
      now: () => t,
      sleep: async (ms) => { sleeps.push(ms); t += ms; },
      minIntervalMs: 1000,
    });
    await mb.resolveArtist('a');
    await mb.resolveArtist('b');
    await mb.resolveArtist('c');
    expect(sleeps.length).toBe(2); // 2nd and 3rd requests waited
    expect(sleeps[0]).toBe(1000);
  });

  it('recordingsOf dedups by MBID and never invents year/language', async () => {
    const mb = new MusicBrainzProvider({ transport: async () => jsonRes(200, recordingsFixture), sleep: sleep0, minIntervalMs: 0 });
    const res = await mb.recordingsOf('5447d3c4-1234-4a4b-8f0e-abcdefabcdef');
    expect(res.length).toBe(2);
    expect(res[0].title).toBe('Tum Hi Ho');
    expect(res[0].year).toBe(2013);
    expect(res[0].releaseGroup).toBe('Aashiqui 2');
    expect(res[1].year).toBeUndefined();
    expect((res[1] as Record<string, unknown>).language).toBeUndefined();
    expect(res[0].source).toBe('musicbrainz');
  });

  it('recordingsOf rejects non-MBID artist ids without a request', async () => {
    let called = 0;
    const mb = new MusicBrainzProvider({ transport: async () => { called++; return jsonRes(200, {}); }, sleep: sleep0, minIntervalMs: 0 });
    expect(await mb.recordingsOf('not-an-mbid')).toEqual([]);
    expect(called).toBe(0);
  });

  it('503 is retried with bounded attempts then surfaces structured error', async () => {
    let n = 0;
    const mb = new MusicBrainzProvider({ transport: async () => { n++; return jsonRes(503, {}); }, sleep: sleep0, minIntervalMs: 0 });
    await expect(mb.resolveArtist('x')).rejects.toThrow(/HTTP 503/);
    expect(n).toBe(3);
  });

  it('empty and malformed responses handled safely', async () => {
    const mb = new MusicBrainzProvider({ transport: async () => jsonRes(200, { artists: [{ name: 'no id' }] }), sleep: sleep0, minIntervalMs: 0 });
    expect(await mb.resolveArtist('x')).toEqual([]); // item without id dropped
    const mb2 = new MusicBrainzProvider({ transport: async () => textRes(200, 'not json'), sleep: sleep0, minIntervalMs: 0 });
    await expect(mb2.resolveArtist('x')).rejects.toThrow(/not valid JSON/);
  });
});
