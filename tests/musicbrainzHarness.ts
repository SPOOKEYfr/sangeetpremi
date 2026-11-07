import { createMusicBrainzClient, type MusicBrainzClient } from '../src/services/musicbrainz/index';

/**
 * Fixtures below mirror the live MusicBrainz and Cover Art Archive response
 * shapes verified against the real services in November 2026:
 * - artist search uses the `artists` envelope;
 * - release groups use `/ws/2/release-group?artist=`;
 * - recordings use `/ws/2/release?release-group=` (release tracks contain
 *   the canonical `recording.id`);
 * - artwork uses `https://coverartarchive.org/release-group/{mbid}`.
 */
export const QUEEN_MBID = '0383dadf-2a4e-4d10-a46a-e9e041da8eb3';
export const BOWIE_MBID = '5441c29d-3602-4898-b1a1-b77fa23b8e50';
export const ANATO_RG_MBID = '6b47c9a0-b9e1-3df9-a5e8-50a6ce0dbdbd';
export const SHEER_HEART_RG_MBID = '002ed683-3327-3df0-88c8-318746089925';
export const ANATO_RELEASE_MBID = '0a1982c2-2870-4e24-9811-5bfa9686d4a3';
export const BOHEMIAN_RECORDING_MBID = 'b1a9c0e9-d987-4042-ae91-78d6a3267d69';
export const BOHEMIAN_TRACK_MBID = '878980e9-70e5-48d2-92e2-cee144d6e844';
export const WWRY_RECORDING_MBID = '1d0a7e56-03e2-4cb4-b8ad-4d2c7e7c7c7e';
export const EMPTY_MBID = '00000000-0000-0000-0000-000000000000';

export const FRONT_URL =
  'https://coverartarchive.org/release/90d2e40a-eee0-4290-aa0a-a5ae3683ea2f/2812830852.jpg';
export const BACK_URL =
  'https://coverartarchive.org/release/90d2e40a-eee0-4290-aa0a-a5ae3683ea2f/25168372415.jpg';
export const THUMB_URL =
  'https://coverartarchive.org/release/90d2e40a-eee0-4290-aa0a-a5ae3683ea2f/2812830852-250.jpg';

const QUEEN_CREDIT = [
  {
    name: 'Queen',
    joinphrase: '',
    artist: {
      id: QUEEN_MBID,
      name: 'Queen',
      'sort-name': 'Queen',
      type: 'Group',
      country: 'GB',
      disambiguation: 'UK rock group',
    },
  },
];

export const QUEEN_ARTIST = {
  id: QUEEN_MBID,
  name: 'Queen',
  'sort-name': 'Queen',
  type: 'Group',
  country: 'GB',
  area: { id: '8a754a16-0027-3a29-b6d7-2b40ea0481ed', type: 'Country', name: 'United Kingdom' },
  disambiguation: 'UK rock group',
  score: 100,
  aliases: [{ name: 'Queen', 'sort-name': 'Queen', locale: 'en', primary: true }],
  tags: [{ count: 2, name: 'rock' }],
};

export const BOWIE_ARTIST = {
  id: BOWIE_MBID,
  name: 'David Bowie',
  'sort-name': 'Bowie, David',
  type: 'Person',
  country: 'GB',
  area: { id: '8a754a16-0027-3a29-b6d7-2b40ea0481ed', type: 'Country', name: 'United Kingdom' },
  disambiguation: 'English singer-songwriter',
  score: 92,
  aliases: [],
  tags: [],
};

export const BEATLES_ARTISTS = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'The Beatles', score: 100 },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Beatles, The', score: 95 },
  { id: '10000000-0000-4000-8000-000000000003', name: 'The Beatles Tribute', score: 80 },
  { id: '10000000-0000-4000-8000-000000000004', name: 'Beatlemania', score: 70 },
];

export const SEARCH_QUEEN_RESPONSE = {
  created: '2026-11-07T00:00:00.000Z',
  count: 2,
  offset: 0,
  artists: [QUEEN_ARTIST, BOWIE_ARTIST],
};

export const SEARCH_NONE_RESPONSE = {
  created: '2026-11-07T00:00:00.000Z',
  count: 0,
  offset: 0,
  artists: [],
};

export const SEARCH_BEATLES_RESPONSE = {
  created: '2026-11-07T00:00:00.000Z',
  count: BEATLES_ARTISTS.length,
  offset: 0,
  artists: BEATLES_ARTISTS,
};

export const RELEASE_GROUPS_RESPONSE = {
  'release-group-count': 2,
  'release-group-offset': 0,
  'release-groups': [
    {
      id: ANATO_RG_MBID,
      title: 'A Night at the Opera',
      'primary-type': 'Album',
      'first-release-date': '1975-11-21',
      disambiguation: 'Studio album',
      'secondary-types': [],
      'artist-credit': QUEEN_CREDIT,
    },
    {
      id: SHEER_HEART_RG_MBID,
      title: 'Sheer Heart Attack',
      'primary-type': 'Album',
      'first-release-date': '1974-11-01',
      disambiguation: '',
      'secondary-types': [],
      'artist-credit': QUEEN_CREDIT,
    },
  ],
};

export const RECORDINGS_RESPONSE = {
  'recording-count': 2,
  'recording-offset': 0,
  recordings: [
    {
      id: BOHEMIAN_RECORDING_MBID,
      title: 'Bohemian Rhapsody',
      length: 355_106,
      'first-release-date': '1975-10-31',
      isrcs: ['GBUM71100531'],
      video: false,
      'artist-credit': QUEEN_CREDIT,
    },
    {
      id: WWRY_RECORDING_MBID,
      title: 'We Will Rock You',
      length: 121_000,
      'first-release-date': '1977-10-07',
      isrcs: ['GBUM71100532'],
      video: false,
      'artist-credit': QUEEN_CREDIT,
    },
  ],
};

export const RELEASES_RESPONSE = {
  'release-count': 1,
  'release-offset': 0,
  releases: [
    {
      id: ANATO_RELEASE_MBID,
      title: 'A Night at the Opera',
      date: '1975-11-21',
      'release-group': {
        id: ANATO_RG_MBID,
        title: 'A Night at the Opera',
        'primary-type': 'Album',
        'first-release-date': '1975-11-21',
        'secondary-types': [],
      },
      media: [
        {
          position: 1,
          format: 'CD',
          'track-count': 1,
          tracks: [
            {
              id: BOHEMIAN_TRACK_MBID,
              number: '11',
              title: 'Bohemian Rhapsody',
              length: 361_000,
              'artist-credit': QUEEN_CREDIT,
              recording: {
                id: BOHEMIAN_RECORDING_MBID,
                title: 'Bohemian Rhapsody',
                length: 355_106,
                'first-release-date': '1975-11-21',
                video: false,
                'artist-credit': QUEEN_CREDIT,
              },
            },
          ],
        },
      ],
    },
  ],
};

export const RECORDING_DETAIL_RESPONSE = {
  id: BOHEMIAN_RECORDING_MBID,
  title: 'Bohemian Rhapsody',
  length: 355_106,
  video: false,
  releases: [
    {
      id: ANATO_RELEASE_MBID,
      title: 'A Night at the Opera',
      'release-group': {
        id: ANATO_RG_MBID,
        title: 'A Night at the Opera',
        'primary-type': 'Album',
        'first-release-date': '1975-11-21',
        'secondary-types': [],
      },
    },
  ],
};

export const RECORDING_WITHOUT_RELEASE_RESPONSE = {
  id: EMPTY_MBID,
  title: 'Unreleased recording',
};

export const COVER_ART_RESPONSE = {
  images: [
    {
      approved: true,
      front: true,
      back: false,
      comment: '',
      id: 2812830852,
      image: FRONT_URL.replace('https://', 'http://'),
      types: ['Front'],
      thumbnails: {
        '250': THUMB_URL.replace('https://', 'http://'),
        '500': FRONT_URL.replace('https://', 'http://'),
        large: FRONT_URL.replace('https://', 'http://'),
        small: THUMB_URL.replace('https://', 'http://'),
      },
    },
    {
      approved: true,
      front: false,
      back: true,
      comment: '',
      id: 25168372415,
      image: BACK_URL.replace('https://', 'http://'),
      types: ['Back'],
      thumbnails: {},
    },
  ],
  release: 'https://musicbrainz.org/release/90d2e40a-eee0-4290-aa0a-a5ae3683ea2f',
};

export const COVER_ART_EMPTY_RESPONSE = { images: [], release: null };

export const ARTIST_CREDITS_RESPONSE = {
  id: ANATO_RG_MBID,
  title: 'A Night at the Opera',
  'primary-type': 'Album',
  'first-release-date': '1975-11-21',
  'secondary-types': [],
  'artist-credit': QUEEN_CREDIT,
};

export const EMPTY_ARTIST_CREDITS_RESPONSE = {
  id: EMPTY_MBID,
  title: 'Empty release group',
  'artist-credit': [],
};

export interface RecordedRequest {
  url: URL;
  init: RequestInit | undefined;
  at: number;
}

export type MockHandler = (
  url: URL,
  init: RequestInit | undefined,
  requestIndex: number,
) => Response | Promise<Response>;

export interface ClientHarness {
  client: MusicBrainzClient;
  requests: RecordedRequest[];
  sleeps: number[];
  now: () => number;
}

export interface HarnessOptions {
  maxRetries?: number;
  requestIntervalMs?: number;
}

/** Build a Response with a JSON body and sensible headers. */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

/**
 * Create a client with mocked HTTP and a fake clock. The clock advances only
 * when the client sleeps, so rate-limit and backoff assertions are exact and
 * tests never wait on real timers.
 */
export function createClientHarness(
  handler: MockHandler,
  options: HarnessOptions = {},
): ClientHarness {
  let clock = 0;
  const requests: RecordedRequest[] = [];
  const sleeps: number[] = [];

  const client = createMusicBrainzClient({
    fetchImpl: async (input, init) => {
      const url =
        input instanceof URL
          ? input
          : typeof input === 'string'
            ? new URL(input)
            : new URL(input.url);
      requests.push({ url, init, at: clock });
      return handler(url, init, requests.length - 1);
    },
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    maxRetries: options.maxRetries,
    requestIntervalMs: options.requestIntervalMs,
  });

  return { client, requests, sleeps, now: () => clock };
}

/** Standard successful live-shaped routes used by unit and integration tests. */
export function catalogueHandler(url: URL): Response {
  const path = url.pathname;

  if (url.hostname === 'coverartarchive.org') {
    if (path === `/release-group/${ANATO_RG_MBID}`) return jsonResponse(COVER_ART_RESPONSE);
    if (path === `/release-group/${EMPTY_MBID}`) return jsonResponse(COVER_ART_EMPTY_RESPONSE);
    return new Response(`Unhandled Cover Art Archive route: ${path}`, { status: 404 });
  }

  if (path === '/ws/2/artist') {
    const query = url.searchParams.get('query');
    if (query === 'Queen') return jsonResponse(SEARCH_QUEEN_RESPONSE);
    if (query === 'The Beatles') return jsonResponse(SEARCH_BEATLES_RESPONSE);
    return jsonResponse(SEARCH_NONE_RESPONSE);
  }

  if (path === `/ws/2/artist/${QUEEN_MBID}`) return jsonResponse(QUEEN_ARTIST);

  if (path === '/ws/2/release-group') {
    if (url.searchParams.get('artist') === QUEEN_MBID) {
      return jsonResponse(RELEASE_GROUPS_RESPONSE);
    }
    return jsonResponse({ 'release-group-count': 0, 'release-group-offset': 0, 'release-groups': [] });
  }

  if (path === `/ws/2/release-group/${ANATO_RG_MBID}`) {
    return jsonResponse(ARTIST_CREDITS_RESPONSE);
  }
  if (path === `/ws/2/release-group/${EMPTY_MBID}`) {
    return jsonResponse(EMPTY_ARTIST_CREDITS_RESPONSE);
  }

  if (path === '/ws/2/recording') {
    if (url.searchParams.get('artist') === QUEEN_MBID) {
      return jsonResponse(RECORDINGS_RESPONSE);
    }
    return jsonResponse({ 'recording-count': 0, 'recording-offset': 0, recordings: [] });
  }

  if (path === `/ws/2/recording/${BOHEMIAN_RECORDING_MBID}`) {
    return jsonResponse(RECORDING_DETAIL_RESPONSE);
  }
  if (path === `/ws/2/recording/${EMPTY_MBID}`) {
    return jsonResponse(RECORDING_WITHOUT_RELEASE_RESPONSE);
  }

  if (path === '/ws/2/release') {
    if (url.searchParams.get('release-group') === ANATO_RG_MBID) {
      return jsonResponse(RELEASES_RESPONSE);
    }
    return jsonResponse({ 'release-count': 0, 'release-offset': 0, releases: [] });
  }

  return new Response(`Unhandled MusicBrainz route: ${path}`, { status: 404 });
}
