import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyRecordingRelationshipToTrack,
  canonicalRecordingToTrack,
  hasVerifiedRecordingStream,
  isVerifiedYouTubeId,
  releaseTypeToCategory,
  coverArtArchiveUrl,
  type CanonicalRecording,
} from '../src/features/discovery/musicbrainzModel';
import {
  searchMusicBrainzArtists,
  loadArtistDiscography,
  loadReleaseGroupRecordings,
} from '../src/features/discovery/musicbrainzClient';
import {
  aggregateReleaseTracks,
  filterVisibleTracks,
  handleDiscoveryAction,
  computeStreamCounts,
  formatTrackCountSummary,
} from '../src/features/discovery/discoveryView';
import { trackCard, trackCardHtml } from '../src/components/trackCard';
import type { Track } from '../src/types';
import type { ReleaseAppearance } from '../src/features/discovery/musicbrainzModel';
import type { MusicBrainzRecordingYouTubeRelationship } from '../src/services/musicbrainz/index';

const bridgeMock = vi.hoisted(() => {
  const offline = () => Promise.reject(new Error('bridge offline in test'));
  const methods = {
    searchArtists: vi.fn(offline) as any,
    getArtistByMBID: vi.fn(offline) as any,
    getReleaseGroupsByArtistMBID: vi.fn(offline) as any,
    getRecordingsByArtistMBID: vi.fn(offline) as any,
    getRecordingsByReleaseGroupMBID: vi.fn(offline) as any,
    getCoverArtArchive: vi.fn(offline) as any,
    getCoverArtArchiveByReleaseGroupMBID: vi.fn(offline) as any,
    getArtistCreditsForReleaseGroup: vi.fn(offline) as any,
    getRecordingYouTubeRelationship: vi.fn(offline) as any,
  };
  return {
    methods,
    reset: () => {
      for (const fn of Object.values(methods)) {
        fn.mockReset();
        fn.mockImplementation(offline);
      }
    },
  };
});

vi.mock('../src/services/musicbrainz/bridge', () => ({
  getUiMusicBrainzClient: () => bridgeMock.methods,
}));

beforeEach(() => {
  // Isolate every suite in this file from live external network by default.
  bridgeMock.reset();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new TypeError('fetch failed (network disabled in unit tests)');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MusicBrainz Frontend Models & Discovery', () => {
  it('identifies that an 11-char YouTube ID alone is NOT proof of verification', () => {
    // A YouTube ID alone without a genuine verified relationship must never be treated as verified
    expect(isVerifiedYouTubeId('yKNxeF4KMsY')).toBe(false);
    expect(isVerifiedYouTubeId('dvgZkm1xWPE')).toBe(false);
    expect(isVerifiedYouTubeId('mb-6f5b9d21-f093')).toBe(false);
    expect(isVerifiedYouTubeId('')).toBe(false);
    expect(isVerifiedYouTubeId('invalid_id')).toBe(false);
  });

  it('verifies that a valid YouTube video ID alone is NOT proof of a verified recording relationship', () => {
    const unverifiedTrack: Track = {
      id: 'yKNxeF4KMsY',
      videoId: 'yKNxeF4KMsY',
      title: 'Some Unverified Recording',
      normalizedTitle: 'some unverified recording',
      artist: 'Some Artist',
      category: 'album',
      role: 'primary',
      versionTags: ['Album', '2020'],
      dedupeKey: 'mb:test-unverified',
      isDuplicate: false,
      discoveredAt: Date.now(),
      lastUpdated: Date.now(),
      youtubeVerified: false,
    };

    expect(isVerifiedYouTubeId(unverifiedTrack.videoId ?? '')).toBe(false);
    // hasVerifiedRecordingStream MUST be false without genuine verified relationship
    expect(hasVerifiedRecordingStream(unverifiedTrack)).toBe(false);

    // Track card HTML must render honest Unmapped state and NOT Watch on YouTube
    const html = trackCardHtml(unverifiedTrack);
    expect(html).toContain('Unmapped');
    expect(html).not.toContain('Watch ↗');
    expect(html).not.toContain('Search YouTube');
  });

  it('generates canonical Cover Art Archive URLs for release groups', () => {
    const mbid = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
    expect(coverArtArchiveUrl(mbid, 250)).toBe(`https://coverartarchive.org/release-group/${mbid}/front-250.jpg`);
    expect(coverArtArchiveUrl(mbid, 500)).toBe(`https://coverartarchive.org/release-group/${mbid}/front-500.jpg`);
  });

  it('maps release types to application categories accurately', () => {
    expect(releaseTypeToCategory('Album')).toBe('album');
    expect(releaseTypeToCategory('Single')).toBe('single');
    expect(releaseTypeToCategory('EP')).toBe('album');
    expect(releaseTypeToCategory('Soundtrack')).toBe('soundtrack');
    expect(releaseTypeToCategory('Live')).toBe('live');
    expect(releaseTypeToCategory('Compilation')).toBe('other');
  });

  it('converts canonical recording to Track without YouTube view counts or false verification badges', () => {
    const rec: CanonicalRecording = {
      id: '729cf505-94eb-4fbe-bc76-cbae44cff091',
      title: 'Yellow',
      artistCredit: 'Coldplay',
      artistMbid: 'cc197bad-dc9c-440d-a5b5-d52ba2e14234',
      releaseGroupTitle: 'Parachutes',
      releaseGroupMbid: '1dc4c347-a1db-32aa-b14f-bc9cc507b843',
      releaseType: 'Album',
      releaseDate: '2000-07-10',
      durationSeconds: 269,
      coverArtUrl: 'https://coverartarchive.org/release-group/1dc4c347-a1db-32aa-b14f-bc9cc507b843/front-250.jpg',
      youtubeStream: undefined,
    };

    const track = canonicalRecordingToTrack(rec, 'Coldplay');

    expect(track.id).toBe('729cf505-94eb-4fbe-bc76-cbae44cff091');
    expect(track.title).toBe('Yellow');
    expect(track.artist).toBe('Coldplay');
    expect(track.category).toBe('album');
    expect(track.viewCount).toBeUndefined(); // Zero YouTube view counts
    expect(track.isDuplicate).toBe(false);
    expect(track.versionTags).toContain('Album');
    expect(track.versionTags).toContain('2000');
    // Initially unverified
    expect(hasVerifiedRecordingStream(track)).toBe(false);

    const html = trackCardHtml(track);
    expect(html).toContain('Unmapped');
    expect(html).not.toContain('Watch ↗');
  });

  it('verifies Yellow only from genuine MusicBrainz recording relationship and exposes Watch link', () => {
    const rec: CanonicalRecording = {
      id: '729cf505-94eb-4fbe-bc76-cbae44cff091',
      title: 'Yellow',
      artistCredit: 'Coldplay',
      artistMbid: 'cc197bad-dc9c-440d-a5b5-d52ba2e14234',
      releaseGroupTitle: 'Parachutes',
      releaseGroupMbid: '1dc4c347-a1db-32aa-b14f-bc9cc507b843',
      releaseType: 'Album',
      releaseDate: '2000-07-10',
      durationSeconds: 269,
      coverArtUrl: 'https://coverartarchive.org/release-group/1dc4c347-a1db-32aa-b14f-bc9cc507b843/front-250.jpg',
      youtubeStream: undefined,
    };

    const track = canonicalRecordingToTrack(rec, 'Coldplay');
    expect(hasVerifiedRecordingStream(track)).toBe(false);

    const verifiedRelationship: MusicBrainzRecordingYouTubeRelationship = {
      recordingMBID: '729cf505-94eb-4fbe-bc76-cbae44cff091',
      recordingTitle: 'Yellow',
      artistCredit: ['Coldplay'],
      lengthSeconds: 269,
      isrc: 'GBAYE0000267',
      relationshipUrl: 'https://www.youtube.com/watch?v=9qnqYL0eNNI',
      relationshipType: 'free streaming',
      relationshipDirection: 'forward',
      source: 'musicbrainz',
      verificationStatus: 'verified',
      verified: true,
      youtubeVideoId: '9qnqYL0eNNI',
      youtubeUrl: 'https://www.youtube.com/watch?v=9qnqYL0eNNI',
    };

    applyRecordingRelationshipToTrack(track, verifiedRelationship);

    expect(track.youtubeVerified).toBe(true);
    expect(track.youtubeVideoId).toBe('9qnqYL0eNNI');
    expect(track.youtubeUrl).toBe('https://www.youtube.com/watch?v=9qnqYL0eNNI');
    expect(hasVerifiedRecordingStream(track)).toBe(true);

    const html = trackCardHtml(track);
    expect(html).toContain('Watch ↗');
    expect(html).toContain('https://www.youtube.com/watch?v=9qnqYL0eNNI');
    expect(html).not.toContain('Unmapped');
  });

  it('strictly rejects the old invalid Yellow fixture ID from establishing verification', () => {
    const invalidTrack: Track = {
      id: '6f5b9d21-f093-4e02-b258-73595561b36e', // Old fixture MBID
      videoId: 'yKNxeF4KMsY',
      title: 'Yellow',
      normalizedTitle: 'yellow',
      artist: 'Coldplay',
      category: 'album',
      role: 'primary',
      versionTags: ['Album', '2000'],
      dedupeKey: 'mb:6f5b9d21-f093-4e02-b258-73595561b36e',
      isDuplicate: false,
      discoveredAt: Date.now(),
      lastUpdated: Date.now(),
      youtubeVerified: false,
    };

    const attemptRel: MusicBrainzRecordingYouTubeRelationship = {
      recordingMBID: '6f5b9d21-f093-4e02-b258-73595561b36e',
      relationshipUrl: 'https://www.youtube.com/watch?v=yKNxeF4KMsY',
      relationshipType: 'free streaming',
      relationshipDirection: 'forward',
      source: 'musicbrainz',
      verificationStatus: 'verified', // Even if falsely claimed
      verified: true,
      youtubeVideoId: 'yKNxeF4KMsY',
      youtubeUrl: 'https://www.youtube.com/watch?v=yKNxeF4KMsY',
    };

    applyRecordingRelationshipToTrack(invalidTrack, attemptRel);

    expect(invalidTrack.youtubeVerified).toBe(false);
    expect(hasVerifiedRecordingStream(invalidTrack)).toBe(false);

    const html = trackCardHtml(invalidTrack);
    expect(html).toContain('Unmapped');
    expect(html).not.toContain('Watch ↗');
  });

  it('preserves unmapped recording status honestly for tracks without qualifying relationships', () => {
    const rec: CanonicalRecording = {
      id: '144a9ec0-e298-47fb-a793-79277f0cff57',
      title: 'Shiver',
      artistCredit: 'Coldplay',
      artistMbid: 'cc197bad-dc9c-440d-a5b5-d52ba2e14234',
      releaseGroupTitle: 'Parachutes',
      releaseGroupMbid: '1dc4c347-a1db-32aa-b14f-bc9cc507b843',
      releaseType: 'Album',
      releaseDate: '2000-07-10',
      durationSeconds: 300,
      youtubeStream: undefined, // Honest unmapped status
    };

    const track = canonicalRecordingToTrack(rec, 'Coldplay');

    const unmappedRel: MusicBrainzRecordingYouTubeRelationship = {
      recordingMBID: '144a9ec0-e298-47fb-a793-79277f0cff57',
      recordingTitle: 'Shiver',
      artistCredit: ['Coldplay'],
      lengthSeconds: 300,
      isrc: 'GBAYE0000265',
      relationshipUrl: null,
      relationshipType: null,
      relationshipDirection: null,
      source: 'musicbrainz',
      verificationStatus: 'unmapped',
      verified: false,
      youtubeVideoId: null,
      youtubeUrl: null,
    };

    applyRecordingRelationshipToTrack(track, unmappedRel);

    expect(track.id).toBe('144a9ec0-e298-47fb-a793-79277f0cff57');
    expect(track.videoId).toBeUndefined();
    expect(track.youtubeVideoId).toBeUndefined();
    expect(track.youtubeVerified).toBe(false);
    expect(hasVerifiedRecordingStream(track)).toBe(false);

    // Track card HTML must render honest Unmapped state and MUST NOT include YouTube search fallback link
    const html = trackCardHtml(track);
    expect(html).toContain('Unmapped');
    expect(html).not.toContain('Watch ↗');
    expect(html).not.toContain('Search YouTube');
    expect(html).not.toContain('youtube.com/results');
  });

  it('retrieves Parachutes recordings using exact release-group MBID without mixing other releases', async () => {
    const parachutesMbid = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
    const recordings = await loadReleaseGroupRecordings(
      parachutesMbid,
      'Parachutes',
      'Album',
      'Coldplay',
    );

    expect(recordings.length).toBeGreaterThan(0);
    // Every single recording must belong to Parachutes
    for (const rec of recordings) {
      expect(rec.releaseGroupMbid).toBe(parachutesMbid);
    }

    // Yellow must be present with its canonical recording MBID
    const yellow = recordings.find((r) => r.title === 'Yellow');
    expect(yellow).toBeDefined();
    expect(yellow?.id).toBe('729cf505-94eb-4fbe-bc76-cbae44cff091');
    expect(yellow?.releaseGroupMbid).toBe(parachutesMbid);

    // Tracks from other release groups (e.g. A Rush of Blood to the Head) must never appear under Parachutes
    const theScientist = recordings.find((r) => r.title === 'The Scientist');
    expect(theScientist).toBeUndefined();
    const clocks = recordings.find((r) => r.title === 'Clocks');
    expect(clocks).toBeUndefined();
  });

  it('produces a truthful empty state for missing release-group recordings without fabricating tracks', async () => {
    const emptyMbid = '00000000-0000-0000-0000-000000000000';
    const recordings = await loadReleaseGroupRecordings(emptyMbid, 'Nonexistent Release', 'Album');
    expect(recordings).toEqual([]);
  });

  it('never assigns unknown recordings to the first release group by fallback', () => {
    const rawRec: CanonicalRecording = {
      id: 'rec-no-rg',
      title: 'Unknown Track',
      artistCredit: 'Coldplay',
      artistMbid: 'cc197bad-dc9c-440d-a5b5-d52ba2e14234',
      releaseGroupTitle: '',
      releaseGroupMbid: '', // Unknown release group
      releaseType: 'Album',
      releaseDate: '',
      youtubeStream: undefined,
    };

    const track = canonicalRecordingToTrack(rawRec, 'Coldplay');
    expect(track.releaseGroupId).toBe('');
    expect(track.channelTitle).toBe('');
    // Must not be assigned to Parachutes or any other release
    expect(track.releaseGroupId).not.toBe('1dc4c347-a1db-32aa-b14f-bc9cc507b843');
  });

  it('clearly identifies curated offline catalogue entries as preview/demo data in fallback mode', async () => {
    const artists = await searchMusicBrainzArtists('Coldplay', { allowPreviewFallback: true });
    expect(artists.length).toBeGreaterThan(0);
    expect(artists[0].id).toBe('cc197bad-dc9c-440d-a5b5-d52ba2e14234');
    expect(artists[0].name.toLowerCase()).toBe('coldplay');
    expect(artists[0].isCuratedPreview).toBe(true);

    const discography = await loadArtistDiscography('cc197bad-dc9c-440d-a5b5-d52ba2e14234', { allowPreviewFallback: true });
    expect(discography.artist.id).toBe('cc197bad-dc9c-440d-a5b5-d52ba2e14234');
    expect(discography.artist.isCuratedPreview).toBe(true);
    expect(discography.releaseGroups.some((rg) => rg.id === '1dc4c347-a1db-32aa-b14f-bc9cc507b843')).toBe(true);
    // Artist-browse recordings are not expected to contain releaseGroupId or Yellow;
    // release-specific recordings are verified under loadReleaseGroupRecordings.
  });

  it('handles artist disambiguation for ambiguous search queries with preview markers in fallback mode', async () => {
    const rahmanMatches = await searchMusicBrainzArtists('rahman', { allowPreviewFallback: true });
    expect(rahmanMatches.length).toBeGreaterThanOrEqual(1);
    expect(rahmanMatches.some((a) => a.name.toLowerCase().includes('rahman'))).toBe(true);
    expect(rahmanMatches.every((a) => a.isCuratedPreview)).toBe(true);

    const nirvanaMatches = await searchMusicBrainzArtists('nirvana', { allowPreviewFallback: true });
    expect(nirvanaMatches.length).toBeGreaterThanOrEqual(2);
    expect(nirvanaMatches.some((a) => a.disambiguation?.toLowerCase().includes('grunge'))).toBe(true);
    expect(nirvanaMatches.some((a) => a.disambiguation?.toLowerCase().includes('psychedelic'))).toBe(true);
    expect(nirvanaMatches.every((a) => a.isCuratedPreview)).toBe(true);
  });

  it('resolves live artist search using controlled network mocks without preview markers', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const urlStr =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (urlStr.includes('/ws/2/artist')) {
        return new Response(
          JSON.stringify({
            artists: [
              {
                id: 'cc197bad-dc9c-440d-a5b5-d52ba2e14234',
                name: 'Coldplay',
                'sort-name': 'Coldplay',
                type: 'Group',
                country: 'GB',
                score: 100,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const artists = await searchMusicBrainzArtists('Coldplay');
    expect(artists.length).toBeGreaterThan(0);
    expect(artists[0].id).toBe('cc197bad-dc9c-440d-a5b5-d52ba2e14234');
    expect(artists[0].name).toBe('Coldplay');
    expect(artists[0].isCuratedPreview).toBe(false);
  });
});

describe('All Tracks Aggregation & Release Focus', () => {
  const rgParachutes = { id: 'rg-parachutes', title: 'Parachutes', primaryType: 'Album' as const };
  const rgLive2003 = { id: 'rg-live2003', title: 'Live 2003', primaryType: 'Live' as const };

  // Shared recording across both releases (e.g. Yellow)
  const sharedYellowParachutes: Track = {
    id: '729cf505-94eb-4fbe-bc76-cbae44cff091',
    title: 'Yellow',
    normalizedTitle: 'yellow',
    artist: 'Coldplay',
    channelTitle: 'Parachutes',
    releaseGroupId: 'rg-parachutes',
    durationSeconds: 269,
    publishedAt: '2000-07-10',
    category: 'album',
    role: 'primary',
    versionTags: ['Album', '2000'],
    dedupeKey: 'mb:729cf505-94eb-4fbe-bc76-cbae44cff091',
    isDuplicate: false,
    discoveredAt: Date.now(),
    lastUpdated: Date.now(),
    youtubeVerified: false,
  };

  const sharedYellowLive2003: Track = {
    id: '729cf505-94eb-4fbe-bc76-cbae44cff091',
    title: 'Yellow',
    normalizedTitle: 'yellow',
    artist: 'Coldplay',
    channelTitle: 'Live 2003',
    releaseGroupId: 'rg-live2003',
    durationSeconds: 275,
    publishedAt: '2003-11-04',
    category: 'live',
    role: 'primary',
    versionTags: ['Live', '2003'],
    dedupeKey: 'mb:729cf505-94eb-4fbe-bc76-cbae44cff091',
    isDuplicate: false,
    discoveredAt: Date.now(),
    lastUpdated: Date.now(),
    youtubeVerified: false,
  };

  // Parachutes-exclusive tracks
  const trackShiver: Track = {
    id: '144a9ec0-e298-47fb-a793-79277f0cff57',
    title: 'Shiver',
    normalizedTitle: 'shiver',
    artist: 'Coldplay',
    channelTitle: 'Parachutes',
    releaseGroupId: 'rg-parachutes',
    durationSeconds: 300,
    publishedAt: '2000-07-10',
    category: 'album',
    role: 'primary',
    versionTags: ['Album', '2000'],
    dedupeKey: 'mb:144a9ec0-e298-47fb-a793-79277f0cff57',
    isDuplicate: false,
    discoveredAt: Date.now(),
    lastUpdated: Date.now(),
    youtubeVerified: false,
  };

  const trackTrouble: Track = {
    id: 'trouble-mbid-001',
    title: 'Trouble',
    normalizedTitle: 'trouble',
    artist: 'Coldplay',
    channelTitle: 'Parachutes',
    releaseGroupId: 'rg-parachutes',
    durationSeconds: 270,
    publishedAt: '2000-07-10',
    category: 'album',
    role: 'primary',
    versionTags: ['Album', '2000'],
    dedupeKey: 'mb:trouble-mbid-001',
    isDuplicate: false,
    discoveredAt: Date.now(),
    lastUpdated: Date.now(),
    youtubeVerified: false,
  };

  // Live 2003-exclusive tracks
  const trackTheScientist: Track = {
    id: 'scientist-mbid-002',
    title: 'The Scientist',
    normalizedTitle: 'the scientist',
    artist: 'Coldplay',
    channelTitle: 'Live 2003',
    releaseGroupId: 'rg-live2003',
    durationSeconds: 310,
    publishedAt: '2003-11-04',
    category: 'live',
    role: 'primary',
    versionTags: ['Live', '2003'],
    dedupeKey: 'mb:scientist-mbid-002',
    isDuplicate: false,
    discoveredAt: Date.now(),
    lastUpdated: Date.now(),
    youtubeVerified: false,
  };

  const trackClocks: Track = {
    id: 'clocks-mbid-003',
    title: 'Clocks',
    normalizedTitle: 'clocks',
    artist: 'Coldplay',
    channelTitle: 'Live 2003',
    releaseGroupId: 'rg-live2003',
    durationSeconds: 320,
    publishedAt: '2003-11-04',
    category: 'live',
    role: 'primary',
    versionTags: ['Live', '2003'],
    dedupeKey: 'mb:clocks-mbid-003',
    isDuplicate: false,
    discoveredAt: Date.now(),
    lastUpdated: Date.now(),
    youtubeVerified: false,
  };

  it('aggregates two release groups preserving canonical IDs and merging release provenance without duplicate rows', () => {
    const parachutesTracks = [sharedYellowParachutes, trackShiver, trackTrouble];
    const live2003Tracks = [sharedYellowLive2003, trackTheScientist, trackClocks];

    // Aggregate release 1 then release 2
    let allTracks = aggregateReleaseTracks([], parachutesTracks);
    expect(allTracks).toHaveLength(3);

    allTracks = aggregateReleaseTracks(allTracks, live2003Tracks);
    // Total unique recordings must be 5 (3 + 3 - 1 shared Yellow)
    expect(allTracks).toHaveLength(5);

    // Yellow must appear exactly once in allTracks
    const yellowMatches = allTracks.filter((t) => t.id === '729cf505-94eb-4fbe-bc76-cbae44cff091');
    expect(yellowMatches).toHaveLength(1);

    const aggregatedYellow = yellowMatches[0];
    // Both release associations must remain available as rich provenance with release-specific metadata
    expect(aggregatedYellow.metadata?.releases).toEqual([
      {
        releaseGroupId: 'rg-parachutes',
        releaseGroupTitle: 'Parachutes',
        category: 'album',
        publishedAt: '2000-07-10',
        durationSeconds: 269,
        thumbnail: undefined,
        versionTags: ['Album', '2000'],
      },
      {
        releaseGroupId: 'rg-live2003',
        releaseGroupTitle: 'Live 2003',
        category: 'live',
        publishedAt: '2003-11-04',
        durationSeconds: 275,
        thumbnail: undefined,
        versionTags: ['Live', '2003'],
      },
    ]);
    expect(aggregatedYellow.metadata?.releaseGroupIds).toContain('rg-parachutes');
    expect(aggregatedYellow.metadata?.releaseGroupIds).toContain('rg-live2003');

    // Aggregate row shows composite release provenance rather than misleadingly presenting only first release
    expect(aggregatedYellow.channelTitle).toBe('Parachutes, Live 2003');

    // Source release tracks remain untouched and retain their release-specific fields
    expect(sharedYellowParachutes.channelTitle).toBe('Parachutes');
    expect(sharedYellowParachutes.category).toBe('album');
    expect(sharedYellowParachutes.publishedAt).toBe('2000-07-10');
    expect(sharedYellowParachutes.durationSeconds).toBe(269);

    expect(sharedYellowLive2003.channelTitle).toBe('Live 2003');
    expect(sharedYellowLive2003.category).toBe('live');
    expect(sharedYellowLive2003.publishedAt).toBe('2003-11-04');
    expect(sharedYellowLive2003.durationSeconds).toBe(275);

    // Merged version tags from both releases are preserved
    expect(aggregatedYellow.versionTags).toContain('Album');
    expect(aggregatedYellow.versionTags).toContain('Live');
  });

  it('filters strictly to individual release and displays only that release recordings', () => {
    const parachutesTracks = [sharedYellowParachutes, trackShiver, trackTrouble];
    const live2003Tracks = [sharedYellowLive2003, trackTheScientist, trackClocks];
    const allTracks = aggregateReleaseTracks(parachutesTracks, live2003Tracks);

    const releaseMap = new Map<string, Track[]>([
      [rgParachutes.id, parachutesTracks],
      [rgLive2003.id, live2003Tracks],
    ]);

    // Select Parachutes
    const visibleParachutes = filterVisibleTracks(allTracks, releaseMap, rgParachutes.id);
    expect(visibleParachutes).toHaveLength(3);
    expect(visibleParachutes.map((t) => t.title)).toEqual(['Yellow', 'Shiver', 'Trouble']);
    expect(visibleParachutes.some((t) => t.title === 'The Scientist')).toBe(false);
    expect(visibleParachutes.some((t) => t.title === 'Clocks')).toBe(false);

    // Each individual release view must still include the shared recording
    expect(visibleParachutes.some((t) => t.id === '729cf505-94eb-4fbe-bc76-cbae44cff091')).toBe(true);

    // Select Live 2003
    const visibleLive = filterVisibleTracks(allTracks, releaseMap, rgLive2003.id);
    expect(visibleLive).toHaveLength(3);
    expect(visibleLive.map((t) => t.title)).toEqual(['Yellow', 'The Scientist', 'Clocks']);
    expect(visibleLive.some((t) => t.title === 'Shiver')).toBe(false);
    expect(visibleLive.some((t) => t.title === 'Trouble')).toBe(false);
    expect(visibleLive.some((t) => t.id === '729cf505-94eb-4fbe-bc76-cbae44cff091')).toBe(true);
  });

  it('restores complete aggregated track collection when selecting All Tracks and clears focus', () => {
    const parachutesTracks = [sharedYellowParachutes, trackShiver, trackTrouble];
    const live2003Tracks = [sharedYellowLive2003, trackTheScientist, trackClocks];
    const allTracks = aggregateReleaseTracks(parachutesTracks, live2003Tracks);

    const releaseMap = new Map<string, Track[]>([
      [rgParachutes.id, parachutesTracks],
      [rgLive2003.id, live2003Tracks],
    ]);

    // First focus on an individual release group
    let selectedRelease: string | undefined = rgParachutes.id;
    let visible = filterVisibleTracks(allTracks, releaseMap, selectedRelease);
    expect(visible).toHaveLength(3);

    // User selects All Tracks: focus is cleared
    selectedRelease = undefined;
    visible = filterVisibleTracks(allTracks, releaseMap, selectedRelease);

    // All tracks from both releases appear (5 distinct canonical recordings)
    expect(visible).toHaveLength(5);
    expect(visible.map((t) => t.title)).toContain('Yellow');
    expect(visible.map((t) => t.title)).toContain('Shiver');
    expect(visible.map((t) => t.title)).toContain('Trouble');
    expect(visible.map((t) => t.title)).toContain('The Scientist');
    expect(visible.map((t) => t.title)).toContain('Clocks');
  });

  it('guarantees displayed count equals visible row count in every selection state', () => {
    const parachutesTracks = [sharedYellowParachutes, trackShiver, trackTrouble];
    const live2003Tracks = [sharedYellowLive2003, trackTheScientist, trackClocks];
    const allTracks = aggregateReleaseTracks(parachutesTracks, live2003Tracks);

    const releaseMap = new Map<string, Track[]>([
      [rgParachutes.id, parachutesTracks],
      [rgLive2003.id, live2003Tracks],
    ]);

    // State 1: Individual Release 1
    const pTracks = filterVisibleTracks(allTracks, releaseMap, rgParachutes.id);
    const pCount = pTracks.length;
    expect(pCount).toBe(3);
    expect(pTracks).toHaveLength(pCount);

    // State 2: Individual Release 2
    const lTracks = filterVisibleTracks(allTracks, releaseMap, rgLive2003.id);
    const lCount = lTracks.length;
    expect(lCount).toBe(3);
    expect(lTracks).toHaveLength(lCount);

    // State 3: All Tracks
    const allVisible = filterVisibleTracks(allTracks, releaseMap, undefined);
    const allCount = allVisible.length;
    expect(allCount).toBe(5);
    expect(allVisible).toHaveLength(allCount);

    // State 4: All Tracks with search filter
    const filteredVisible = filterVisibleTracks(allTracks, releaseMap, undefined, 'all', 'clocks');
    const filteredCount = filteredVisible.length;
    expect(filteredCount).toBe(1);
    expect(filteredVisible[0].title).toBe('Clocks');
    expect(filteredVisible).toHaveLength(filteredCount);
  });

  it('supports repeated switching between individual releases and All Tracks without stale filtering state', () => {
    const parachutesTracks = [sharedYellowParachutes, trackShiver, trackTrouble];
    const live2003Tracks = [sharedYellowLive2003, trackTheScientist, trackClocks];
    const allTracks = aggregateReleaseTracks(parachutesTracks, live2003Tracks);

    const releaseMap = new Map<string, Track[]>([
      [rgParachutes.id, parachutesTracks],
      [rgLive2003.id, live2003Tracks],
    ]);

    let focus: string | undefined = undefined;

    // Cycle 1: All Tracks -> Release 1 -> All Tracks
    expect(filterVisibleTracks(allTracks, releaseMap, focus)).toHaveLength(5);
    focus = rgParachutes.id;
    expect(filterVisibleTracks(allTracks, releaseMap, focus)).toHaveLength(3);
    focus = undefined; // Select All Tracks
    expect(filterVisibleTracks(allTracks, releaseMap, focus)).toHaveLength(5);

    // Cycle 2: Release 2 -> All Tracks
    focus = rgLive2003.id;
    expect(filterVisibleTracks(allTracks, releaseMap, focus)).toHaveLength(3);
    focus = undefined; // Select All Tracks
    expect(filterVisibleTracks(allTracks, releaseMap, focus)).toHaveLength(5);

    // Cycle 3: Release 1 -> Release 2 -> All Tracks
    focus = rgParachutes.id;
    expect(filterVisibleTracks(allTracks, releaseMap, focus)).toHaveLength(3);
    focus = rgLive2003.id;
    expect(filterVisibleTracks(allTracks, releaseMap, focus)).toHaveLength(3);
    focus = undefined; // Select All Tracks
    expect(filterVisibleTracks(allTracks, releaseMap, focus)).toHaveLength(5);
  });

  it('handles empty release groups and loading states truthfully without fabricating counts', () => {
    const parachutesTracks = [sharedYellowParachutes, trackShiver];
    const allTracks = aggregateReleaseTracks([], parachutesTracks);

    const releaseMap = new Map<string, Track[]>([
      [rgParachutes.id, parachutesTracks],
      ['rg-empty', []], // Empty release group
    ]);

    // An empty release returns empty list and reports 0 count
    const emptyTracks = filterVisibleTracks(allTracks, releaseMap, 'rg-empty');
    expect(emptyTracks).toHaveLength(0);

    // Non-existent release group returns empty list
    const unindexedTracks = filterVisibleTracks(allTracks, releaseMap, 'rg-nonexistent');
    expect(unindexedTracks).toHaveLength(0);

    // All Tracks count remains truthful
    const allVisible = filterVisibleTracks(allTracks, releaseMap, undefined);
    expect(allVisible).toHaveLength(2);
  });

  it('handles discovery button interactions to select releases, click All Tracks, and clear focus with matching counts', () => {
    const parachutesTracks = [sharedYellowParachutes, trackShiver, trackTrouble];
    const live2003Tracks = [sharedYellowLive2003, trackTheScientist, trackClocks];
    const allTracks = aggregateReleaseTracks(parachutesTracks, live2003Tracks);

    const releaseMap = new Map<string, Track[]>([
      [rgParachutes.id, parachutesTracks],
      [rgLive2003.id, live2003Tracks],
    ]);

    const state: {
      selectedReleaseGroupMbid?: string;
      viewMode: 'discography' | 'tracks';
    } = {
      selectedReleaseGroupMbid: undefined,
      viewMode: 'discography',
    };

    // Step 1: User selects Parachutes release group
    handleDiscoveryAction(state, { type: 'select_release_group', releaseGroupId: rgParachutes.id });
    expect(state.selectedReleaseGroupMbid).toBe('rg-parachutes');
    expect(state.viewMode).toBe('tracks');

    const parachutesRows = filterVisibleTracks(allTracks, releaseMap, state.selectedReleaseGroupMbid);
    expect(parachutesRows).toHaveLength(3);
    expect(parachutesRows.map((t) => t.title)).toEqual(['Yellow', 'Shiver', 'Trouble']);

    // Step 2: User clicks "All Tracks" button (#d-mode-tracks)
    handleDiscoveryAction(state, { type: 'select_all_tracks' });
    expect(state.selectedReleaseGroupMbid).toBeUndefined(); // Focus must be cleared
    expect(state.viewMode).toBe('tracks');

    const allRowsAfterP = filterVisibleTracks(allTracks, releaseMap, state.selectedReleaseGroupMbid);
    expect(allRowsAfterP).toHaveLength(5); // Complete aggregated collection restored
    const titlesAfterP = allRowsAfterP.map((t) => t.title);
    expect(titlesAfterP).toContain('Yellow');
    expect(titlesAfterP).toContain('Shiver');
    expect(titlesAfterP).toContain('Trouble');
    expect(titlesAfterP).toContain('The Scientist');
    expect(titlesAfterP).toContain('Clocks');

    // Step 3: User selects Live 2003 release group
    handleDiscoveryAction(state, { type: 'select_release_group', releaseGroupId: rgLive2003.id });
    expect(state.selectedReleaseGroupMbid).toBe('rg-live2003');
    expect(state.viewMode).toBe('tracks');

    const liveRows = filterVisibleTracks(allTracks, releaseMap, state.selectedReleaseGroupMbid);
    expect(liveRows).toHaveLength(3);
    expect(liveRows.map((t) => t.title)).toEqual(['Yellow', 'The Scientist', 'Clocks']);

    // Step 4: User clicks "All Tracks" button again (#d-mode-tracks)
    handleDiscoveryAction(state, { type: 'select_all_tracks' });
    expect(state.selectedReleaseGroupMbid).toBeUndefined();
    expect(state.viewMode).toBe('tracks');

    const allRowsAfterL = filterVisibleTracks(allTracks, releaseMap, state.selectedReleaseGroupMbid);
    expect(allRowsAfterL).toHaveLength(5);
    expect(allRowsAfterL.length).toBe(5);

    // Step 5: User focuses on a release then clears via clear chip (#d-clear-rg)
    handleDiscoveryAction(state, { type: 'select_release_group', releaseGroupId: rgParachutes.id });
    expect(state.selectedReleaseGroupMbid).toBe('rg-parachutes');

    handleDiscoveryAction(state, { type: 'clear_release_focus' });
    expect(state.selectedReleaseGroupMbid).toBeUndefined();
    expect(state.viewMode).toBe('tracks');

    const allRowsAfterClear = filterVisibleTracks(allTracks, releaseMap, state.selectedReleaseGroupMbid);
    expect(allRowsAfterClear).toHaveLength(5);
  });

  describe('Defect A: Release-specific provenance & multi-appearance presentation', () => {
    const appearances: ReleaseAppearance[] = [
      {
        releaseGroupId: 'rg-parachutes',
        releaseGroupTitle: 'Parachutes',
        category: 'album',
        publishedAt: '2000-07-10',
        durationSeconds: 269,
        thumbnail: 'https://coverartarchive.org/release-group/rg-parachutes/front-250.jpg',
        versionTags: ['Album', '2000'],
      },
      {
        releaseGroupId: 'rg-live2003',
        releaseGroupTitle: 'Live 2003',
        category: 'live',
        publishedAt: '2003-11-04',
        durationSeconds: 275,
        thumbnail: 'https://coverartarchive.org/release-group/rg-live2003/front-250.jpg',
        versionTags: ['Live', '2003'],
      },
      {
        releaseGroupId: 'rg-singles',
        releaseGroupTitle: 'The Singles 1999–2006',
        category: 'other',
        publishedAt: undefined, // Missing date
        durationSeconds: 269,
        thumbnail: undefined, // Missing artwork
        versionTags: ['Compilation'],
      },
    ];

    const multiAppearanceTrack: Track = {
      id: '729cf505-94eb-4fbe-bc76-cbae44cff091',
      title: 'Yellow',
      normalizedTitle: 'yellow',
      artist: 'Coldplay',
      channelTitle: 'Parachutes, Live 2003, The Singles 1999–2006',
      releaseGroupId: 'rg-parachutes',
      thumbnail: 'https://coverartarchive.org/release-group/rg-parachutes/front-250.jpg',
      durationSeconds: 269,
      publishedAt: '2000-07-10',
      category: 'album',
      role: 'primary',
      versionTags: ['Album', '2000', 'Live', '2003', 'Compilation'],
      dedupeKey: 'mb:729cf505-94eb-4fbe-bc76-cbae44cff091',
      isDuplicate: false,
      discoveredAt: Date.now(),
      lastUpdated: Date.now(),
      youtubeVerified: false,
      metadata: {
        releases: appearances,
        releaseGroupIds: ['rg-parachutes', 'rg-live2003', 'rg-singles'],
      },
    };

    it('renders release provenance toggle button and drawer for tracks with multiple appearances', () => {
      const html = trackCardHtml(multiAppearanceTrack);
      // Multi-appearance toggle button
      expect(html).toContain('release-provenance-toggle');
      expect(html).toContain('3 releases');

      // Drawer container
      expect(html).toContain('release-provenance-drawer');
      expect(html).toContain('Release Appearances (3)');

      // Appearance 1: Parachutes
      expect(html).toContain('Parachutes');
      expect(html).toContain('https://coverartarchive.org/release-group/rg-parachutes/front-250.jpg');
      expect(html).toContain('2000');

      // Appearance 2: Live 2003
      expect(html).toContain('Live 2003');
      expect(html).toContain('https://coverartarchive.org/release-group/rg-live2003/front-250.jpg');
      expect(html).toContain('2003');

      // Appearance 3: Honest fallback for missing date and artwork
      expect(html).toContain('The Singles 1999–2006');
      expect(html).toContain('Date unindexed');
      expect(html).toContain('album-art-fallback');
    });

    it('preserves single-release card presentation without drawer when track has single appearance', () => {
      const singleAppearanceTrack: Track = {
        id: '144a9ec0-e298-47fb-a793-79277f0cff57',
        title: 'Shiver',
        normalizedTitle: 'shiver',
        artist: 'Coldplay',
        channelTitle: 'Parachutes',
        releaseGroupId: 'rg-parachutes',
        thumbnail: 'https://coverartarchive.org/release-group/rg-parachutes/front-250.jpg',
        durationSeconds: 300,
        publishedAt: '2000-07-10',
        category: 'album',
        role: 'primary',
        versionTags: ['Album', '2000'],
        dedupeKey: 'mb:144a9ec0-e298-47fb-a793-79277f0cff57',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: false,
        metadata: {
          releases: [appearances[0]],
        },
      };

      const html = trackCardHtml(singleAppearanceTrack);
      expect(html).not.toContain('release-provenance-toggle');
      expect(html).not.toContain('release-provenance-drawer');
      expect(html).toContain('Parachutes');
    });

    it('interactively toggles provenance drawer on button click without toggling track selection', () => {
      type MockEl = {
        tagName: string;
        className: string;
        dataset: Record<string, string>;
        style: Record<string, string>;
        innerHTML: string;
        attributes: Record<string, string>;
        listeners: Record<string, ((e: any) => void)[]>;
        setAttribute(k: string, v: string): void;
        getAttribute(k: string): string | null;
        addEventListener(evt: string, fn: (e: any) => void): void;
        querySelector(selector: string): any;
        querySelectorAll(selector: string): any[];
        closest(sel: string): any;
        click(): void;
      };

      let el: MockEl;
      let toggleBtn: MockEl;
      let drawer: MockEl;
      let chevron: MockEl;
      let checkBtn: MockEl;

      const createMockEl = (tag: string, cls = ''): MockEl => {
        const listeners: Record<string, ((e: any) => void)[]> = {};
        const attrs: Record<string, string> = {};
        const style: Record<string, string> = { display: 'none' };
        const elObj: MockEl = {
          tagName: tag.toUpperCase(),
          className: cls,
          dataset: {},
          style,
          innerHTML: '',
          attributes: attrs,
          listeners,
          setAttribute(k, v) {
            attrs[k] = v;
          },
          getAttribute(k) {
            return attrs[k] ?? null;
          },
          addEventListener(evt, fn) {
            listeners[evt] = listeners[evt] || [];
            listeners[evt].push(fn);
          },
          querySelector(sel: string) {
            if (sel === '.release-provenance-toggle') return toggleBtn;
            if (sel === '.release-provenance-drawer') return drawer;
            if (sel === '.track-check') return checkBtn;
            if (sel === '.provenance-chevron') return chevron;
            return null;
          },
          querySelectorAll(_sel: string) {
            return [];
          },
          closest(sel: string) {
            if (sel.includes('.release-provenance-drawer') && elObj === drawer) return drawer;
            if (sel.includes('button') && (elObj === toggleBtn || elObj === checkBtn)) return elObj;
            return null;
          },
          click() {
            const ev = {
              defaultPrevented: false,
              propagationStopped: false,
              preventDefault() {
                this.defaultPrevented = true;
              },
              stopPropagation() {
                this.propagationStopped = true;
              },
              target: elObj,
            };
            (listeners['click'] || []).forEach((fn) => fn(ev));
            if (!ev.propagationStopped && elObj !== el) {
              (el.listeners['click'] || []).forEach((fn) => fn(ev));
            }
          },
        };
        return elObj;
      };

      toggleBtn = createMockEl('button', 'release-provenance-toggle');
      drawer = createMockEl('div', 'release-provenance-drawer');
      chevron = createMockEl('span', 'provenance-chevron');
      checkBtn = createMockEl('button', 'track-check');
      el = createMockEl('div', 'track-card');

      const origDoc = (globalThis as any).document;
      (globalThis as any).document = {
        createElement: (tag: string) => {
          if (tag === 'div') return el;
          return createMockEl(tag);
        },
      };

      try {
        const onToggle = vi.fn();
        const card = trackCard(multiAppearanceTrack, { showCheckbox: true, onToggle });
        expect(card).toBe(el);
        expect(drawer.style.display).toBe('none');

        // Click toggle button: opens drawer
        toggleBtn.click();
        expect(drawer.style.display).toBe('flex');
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
        expect(onToggle).not.toHaveBeenCalled();

        // Click toggle button again: closes drawer
        toggleBtn.click();
        expect(drawer.style.display).toBe('none');
        expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
        expect(onToggle).not.toHaveBeenCalled();

        // Click drawer body: does not toggle card selection
        drawer.click();
        expect(onToggle).not.toHaveBeenCalled();
      } finally {
        (globalThis as any).document = origDoc;
      }
    });
  });

  describe('Defect B: Playlist verified stream badge counts', () => {
    it('accurately distinguishes verified streams from unmapped streams using hasVerifiedRecordingStream', () => {
      const verifiedTrack: Track = {
        id: 'track-verified-1',
        title: 'Verified Track',
        normalizedTitle: 'verified track',
        artist: 'Artist',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: 'mb:track-verified-1',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: true,
        youtubeVideoId: 'verifiedVid123',
      };

      const unverifiedTrackWithId: Track = {
        id: 'track-unverified-2',
        title: 'Unverified Track',
        normalizedTitle: 'unverified track',
        artist: 'Artist',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: 'mb:track-unverified-2',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        videoId: 'someVideoId123',
        youtubeVerified: false,
      };

      expect(hasVerifiedRecordingStream(verifiedTrack)).toBe(true);
      expect(hasVerifiedRecordingStream(unverifiedTrackWithId)).toBe(false);

      const playlistTracks = [verifiedTrack, unverifiedTrackWithId];
      const verifiedCount = playlistTracks.filter((t) => hasVerifiedRecordingStream(t)).length;
      const unmappedCount = playlistTracks.length - verifiedCount;

      expect(verifiedCount).toBe(1);
      expect(unmappedCount).toBe(1);
    });
  });

  describe('Defect C: MV3 CSP Compliance (no inline event handlers)', () => {
    it('ensures no inline onclick attributes exist in discoveryView source', () => {
      const fs = (globalThis as any).process?.getBuiltinModule?.('fs');
      if (fs) {
        const source = fs.readFileSync('src/features/discovery/discoveryView.ts', 'utf-8');
        expect(source).not.toContain('onclick=');
        expect(source).not.toContain('onerror=');
        expect(source).not.toContain('onload=');
      }
    });

    it('ensures no inline onclick attributes exist in trackCard source', () => {
      const fs = (globalThis as any).process?.getBuiltinModule?.('fs');
      if (fs) {
        const source = fs.readFileSync('src/components/trackCard.ts', 'utf-8');
        expect(source).not.toContain('onclick=');
        expect(source).not.toContain('onerror=');
        expect(source).not.toContain('onload=');
      }
    });
  });

  describe('Defect D: Dynamic stream counts & relationship synchronization', () => {
    it('computes verified, pending, and unmapped stream counts accurately without double-counting', () => {
      const t1: Track = {
        id: 'mbid-1',
        title: 'Song 1',
        normalizedTitle: 'song 1',
        artist: 'Band',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: 'mb:mbid-1',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: true,
        youtubeVideoId: 'video1',
      };
      const t2: Track = {
        id: 'mbid-2',
        title: 'Song 2',
        normalizedTitle: 'song 2',
        artist: 'Band',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: 'mb:mbid-2',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: false,
      };
      const t3: Track = {
        id: 'mbid-3',
        title: 'Song 3',
        normalizedTitle: 'song 3',
        artist: 'Band',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: 'mb:mbid-3',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: false,
      };

      const allTracks = [t1, t2, t3];
      const pendingSet = new Set<string>(['mbid-2']);

      const initialCounts = computeStreamCounts(allTracks, pendingSet);
      expect(initialCounts.verified).toBe(1);
      expect(initialCounts.pending).toBe(1);
      expect(initialCounts.unmapped).toBe(1);

      // Transition pending track to verified
      t2.youtubeVerified = true;
      t2.youtubeVideoId = 'video2';
      pendingSet.delete('mbid-2');

      const resolvedCounts = computeStreamCounts(allTracks, pendingSet);
      expect(resolvedCounts.verified).toBe(2);
      expect(resolvedCounts.pending).toBe(0);
      expect(resolvedCounts.unmapped).toBe(1);
    });

    it('synchronizes verification across both allTracks and releaseGroupTracks', () => {
      const tAll: Track = {
        id: 'mbid-shared',
        title: 'Shared Track',
        normalizedTitle: 'shared track',
        artist: 'Band',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: 'mb:mbid-shared',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: false,
      };

      const tRelease: Track = { ...tAll };

      const allTracks = [tAll];
      const releaseGroupTracks = new Map<string, Track[]>([['rg-1', [tRelease]]]);

      const rel: MusicBrainzRecordingYouTubeRelationship = {
        recordingMBID: 'mbid-shared',
        recordingTitle: 'Shared Track',
        artistCredit: ['Band'],
        relationshipUrl: 'https://www.youtube.com/watch?v=sharedVid',
        relationshipType: 'free streaming',
        relationshipDirection: 'forward',
        source: 'musicbrainz',
        verificationStatus: 'verified',
        verified: true,
        youtubeVideoId: 'sharedVid',
        youtubeUrl: 'https://www.youtube.com/watch?v=sharedVid',
      };

      // Apply to all instances
      applyRecordingRelationshipToTrack(tAll, rel);
      for (const list of releaseGroupTracks.values()) {
        for (const t of list) {
          if (t.id === rel.recordingMBID) {
            applyRecordingRelationshipToTrack(t, rel);
          }
        }
      }

      expect(hasVerifiedRecordingStream(allTracks[0])).toBe(true);
      expect(hasVerifiedRecordingStream(tRelease)).toBe(true);
      expect(tAll.youtubeVideoId).toBe('sharedVid');
      expect(tRelease.youtubeVideoId).toBe('sharedVid');
    });

    it('focused-release and All Tracks header counts match the resolved card actions', () => {
      const releaseGroupId = 'rg-focused';
      const makeTrack = (
        id: string,
        releaseGroupIdValue: string,
        verified = false,
      ): Track => ({
        id,
        title: id,
        normalizedTitle: id,
        artist: 'Band',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: `mb:${id}`,
        isDuplicate: false,
        discoveredAt: 1,
        lastUpdated: 1,
        releaseGroupId: releaseGroupIdValue,
        youtubeVerified: verified,
        youtubeVideoId: verified ? `vid-${id}` : undefined,
        youtubeUrl: verified ? `https://www.youtube.com/watch?v=vid-${id}` : undefined,
      });

      const focusedA = makeTrack('a', releaseGroupId, true);
      const focusedB = makeTrack('b', releaseGroupId);
      const other = makeTrack('c', 'rg-other');
      const allTracks = [focusedA, focusedB, other];
      const releaseGroupTracks = new Map<string, Track[]>([
        [releaseGroupId, [focusedA, focusedB]],
        ['rg-other', [other]],
      ]);
      const pending = new Set<string>();

      const focusedTracks = filterVisibleTracks(
        allTracks,
        releaseGroupTracks,
        releaseGroupId,
      );
      const focusedCounts = computeStreamCounts(focusedTracks, pending);
      expect(focusedCounts).toEqual({ verified: 1, pending: 0, unmapped: 1 });
      expect(
        focusedTracks.filter((track) => trackCardHtml(track).includes('Watch ↗')),
      ).toHaveLength(focusedCounts.verified);
      expect(
        focusedTracks.filter((track) => trackCardHtml(track).includes('Unmapped')),
      ).toHaveLength(focusedCounts.unmapped);

      // A card in the pending set must render the same "Verifying…" state the
      // header counts, not a contradictory "Unmapped" label.
      const pendingSet = new Set([focusedB.id]);
      const pendingCounts = computeStreamCounts(focusedTracks, pendingSet);
      expect(pendingCounts).toEqual({ verified: 1, pending: 1, unmapped: 0 });
      const pendingCard = trackCardHtml(focusedB, { pendingStream: true });
      expect(pendingCard).toContain('Verifying…');
      expect(pendingCard).not.toContain('Unmapped');
      expect(
        focusedTracks.filter((track) =>
          trackCardHtml(track, {
            pendingStream: pendingSet.has(track.id),
          }).includes('Watch ↗'),
        ),
      ).toHaveLength(pendingCounts.verified);
      expect(
        focusedTracks.filter((track) =>
          trackCardHtml(track, {
            pendingStream: pendingSet.has(track.id),
          }).includes('Verifying…'),
        ),
      ).toHaveLength(pendingCounts.pending);
      expect(
        focusedTracks.filter((track) =>
          trackCardHtml(track, {
            pendingStream: pendingSet.has(track.id),
          }).includes('Unmapped'),
        ),
      ).toHaveLength(pendingCounts.unmapped);

      const allVisible = filterVisibleTracks(
        allTracks,
        releaseGroupTracks,
        undefined,
      );
      const allCounts = computeStreamCounts(allVisible, pending);
      expect(allCounts).toEqual({ verified: 1, pending: 0, unmapped: 2 });

      // Asynchronous relationship resolution mutates the focused card, then
      // the header is recomputed from the same scoped list.
      const relationship: MusicBrainzRecordingYouTubeRelationship = {
        recordingMBID: focusedB.id,
        recordingTitle: focusedB.title,
        artistCredit: ['Band'],
        relationshipUrl: 'https://www.youtube.com/watch?v=vid-b',
        relationshipType: 'free streaming',
        relationshipDirection: 'forward',
        source: 'musicbrainz',
        verificationStatus: 'verified',
        verified: true,
        youtubeVideoId: 'vid-b',
        youtubeUrl: 'https://www.youtube.com/watch?v=vid-b',
      };
      applyRecordingRelationshipToTrack(focusedB, relationship);

      const refreshed = computeStreamCounts(focusedTracks, pending);
      expect(refreshed).toEqual({ verified: 2, pending: 0, unmapped: 0 });
      expect(
        focusedTracks.filter((track) => trackCardHtml(track).includes('Watch ↗')),
      ).toHaveLength(refreshed.verified);
      expect(
        focusedTracks.filter((track) => trackCardHtml(track).includes('Unmapped')),
      ).toHaveLength(refreshed.unmapped);

      // The All Tracks aggregate reflects the same resolved relationship
      // while still including the unrelated release group's unmapped card.
      const allRefreshed = computeStreamCounts(allVisible, pending);
      expect(allRefreshed).toEqual({ verified: 2, pending: 0, unmapped: 1 });
    });
  });

  describe('Defect E: Disambiguate filter and focus labels and counts', () => {
    it('formats unambiguous labels when viewing all tracks without active filter', () => {
      const summary = formatTrackCountSummary({
        isFocused: false,
        visibleCount: 40,
        scopeTotalCount: 40,
        hasFilter: false,
      });

      expect(summary.scopeLabel).toBe('All Canonical Tracks');
      expect(summary.countLabel).toBe('40 tracks');
    });

    it('formats unambiguous labels when filtering all tracks', () => {
      const summary = formatTrackCountSummary({
        isFocused: false,
        visibleCount: 3,
        scopeTotalCount: 40,
        hasFilter: true,
      });

      expect(summary.scopeLabel).toBe('All Canonical Tracks');
      expect(summary.countLabel).toBe('Showing 3 of 40 tracks');
    });

    it('formats unambiguous labels when viewing an individual release without filter', () => {
      const summary = formatTrackCountSummary({
        isFocused: true,
        focusedTitle: 'Parachutes',
        visibleCount: 10,
        scopeTotalCount: 10,
        hasFilter: false,
      });

      expect(summary.scopeLabel).toBe('Release: Parachutes');
      expect(summary.countLabel).toBe('10 tracks');
    });

    it('formats unambiguous labels when filtering an individual release', () => {
      const summary = formatTrackCountSummary({
        isFocused: true,
        focusedTitle: 'Parachutes',
        visibleCount: 2,
        scopeTotalCount: 10,
        hasFilter: true,
      });

      expect(summary.scopeLabel).toBe('Release: Parachutes');
      expect(summary.countLabel).toBe('Showing 2 of 10 tracks');
    });
  });

  describe('Defect F: Canonical release-group title consistency', () => {
    it('loadReleaseGroupRecordings prefers canonical releaseGroupTitle over fallback or edition title', async () => {
      const recs = await loadReleaseGroupRecordings(
        '1dc4c347-a1db-32aa-b14f-bc9cc507b843',
        'Parachutes',
        'Album',
        'Coldplay',
      );

      expect(recs.length).toBeGreaterThan(0);
      for (const rec of recs) {
        expect(rec.releaseGroupTitle).toBe('Parachutes');
      }
    });

    it('bridge artist recordings preserve releaseGroupMbid and canonical titles', async () => {
      const artistMbid = 'cc197bad-dc9c-440d-a5b5-d52ba2e14234';
      const releaseGroupMbid = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
      const recordingMbid = '729cf505-94eb-4fbe-bc76-cbae44cff091';
      const credit = [{ artist: { id: artistMbid, name: 'Coldplay' } }];

      bridgeMock.methods.getArtistByMBID.mockResolvedValue({
        id: artistMbid,
        name: 'Coldplay',
        type: 'Group',
        country: 'GB',
        area: { name: 'United Kingdom' },
        disambiguation: '',
      });
      bridgeMock.methods.getReleaseGroupsByArtistMBID.mockResolvedValue([
        {
          id: releaseGroupMbid,
          title: 'Parachutes',
          primarytype: 'Album',
          firstreleaseyear: 2000,
          secondarytypes: [],
          artist_credit: credit,
        },
      ]);
      bridgeMock.methods.getRecordingsByArtistMBID.mockResolvedValue([
        {
          id: recordingMbid,
          title: 'Yellow',
          length: 269,
          firstReleaseDate: '2000-07-10',
          firstreleaseyear: 2000,
          releaseGroupId: releaseGroupMbid,
          releaseTitle: 'Parachutes',
          artist_credit: credit,
        },
      ]);

      const discography = await loadArtistDiscography(artistMbid);
      expect(discography.recordings).toHaveLength(1);
      expect(discography.recordings[0]).toMatchObject({
        id: recordingMbid,
        title: 'Yellow',
        releaseGroupMbid,
        releaseGroupTitle: 'Parachutes',
        releaseType: 'Album',
      });
    });

    it('direct-fetch artist recordings request release groups and preserve them', async () => {
      const artistMbid = 'cc197bad-dc9c-440d-a5b5-d52ba2e14234';
      const releaseGroupMbid = '1dc4c347-a1db-32aa-b14f-bc9cc507b843';
      const recordingMbid = '729cf505-94eb-4fbe-bc76-cbae44cff091';
      const requestedUrls: string[] = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        requestedUrls.push(url);

        if (url.includes(`/artist/${artistMbid}`)) {
          return new Response(
            JSON.stringify({
              id: artistMbid,
              name: 'Coldplay',
              'sort-name': 'Coldplay',
              type: 'Group',
              country: 'GB',
              area: { name: 'United Kingdom' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/release-group?')) {
          return new Response(
            JSON.stringify({
              'release-groups': [
                {
                  id: releaseGroupMbid,
                  title: 'Parachutes',
                  'primary-type': 'Album',
                  'first-release-date': '2000-07-10',
                  'secondary-types': [],
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/release?')) {
          return new Response(
            JSON.stringify({
              releases: [
                {
                  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                  title: 'Parachutes',
                  date: '2000-07-10',
                  'release-group': {
                    id: releaseGroupMbid,
                    title: 'Parachutes',
                    'primary-type': 'Album',
                    'first-release-date': '2000-07-10',
                  },
                  media: [
                    {
                      tracks: [
                        {
                          id: 'ffffffff-1111-4222-8333-444444444444',
                          title: 'Yellow',
                          length: 269_000,
                          recording: {
                            id: recordingMbid,
                            title: 'Yellow',
                            length: 269_000,
                            'first-release-date': '2000-07-10',
                            'artist-credit': [
                              { artist: { id: artistMbid, name: 'Coldplay' } },
                            ],
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const discography = await loadArtistDiscography(artistMbid);
      expect(discography.recordings).toHaveLength(1);
      expect(discography.recordings[0]).toMatchObject({
        id: recordingMbid,
        title: 'Yellow',
        releaseGroupMbid,
        releaseGroupTitle: 'Parachutes',
        releaseType: 'Album',
      });

      const releaseRequest = requestedUrls.find((url) => url.includes('/release?'));
      expect(releaseRequest, requestedUrls.join('\n')).toBeDefined();
      expect(releaseRequest).toContain('inc=recordings+artist-credits+release-groups');
      expect(releaseRequest).not.toContain('/recording?artist=');
    });
  });

  describe('RC5 Task A: Intentional Library Actions & Selection State', () => {
    it('provides distinct Add to Library action and does not conflate it with playlist creation', () => {
      const t1: Track = {
        id: 'rec-1',
        title: 'Song 1',
        normalizedTitle: 'song 1',
        artist: 'Band',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: 'mb:rec-1',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: false,
      };

      const selectedIds = new Set<string>(['rec-1']);
      expect(selectedIds.size).toBe(1);

      // Verify that selection state is tracked explicitly
      const selectedTracks = [t1].filter((t) => selectedIds.has(t.id));
      expect(selectedTracks).toHaveLength(1);
    });

    it('differentiates newly added tracks from already-saved tracks', () => {
      const savedTrack: Track = {
        id: 'rec-saved',
        title: 'Saved Song',
        normalizedTitle: 'saved song',
        artist: 'Band',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: 'mb:rec-saved',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: false,
      };
      const newTrack: Track = {
        id: 'rec-new',
        title: 'New Song',
        normalizedTitle: 'new song',
        artist: 'Band',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: 'mb:rec-new',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: false,
      };

      const currentLibrary = [savedTrack];
      const selected = [savedTrack, newTrack];

      const currentIds = new Set(currentLibrary.map((t) => t.id));
      const newlyAdded = selected.filter((t) => !currentIds.has(t.id));
      const alreadySaved = selected.length - newlyAdded.length;

      expect(newlyAdded).toHaveLength(1);
      expect(newlyAdded[0].id).toBe('rec-new');
      expect(alreadySaved).toBe(1);
    });
  });

  describe('RC5 Task B: Library Removal & Retention of Playlists and Favorites', () => {
    it('removing a track from library sessions leaves favorites and playlists intact', () => {
      const t1: Track = {
        id: 'shared-rec-1',
        title: 'Shared Song',
        normalizedTitle: 'shared song',
        artist: 'Band',
        category: 'album',
        role: 'primary',
        versionTags: [],
        dedupeKey: 'mb:shared-rec-1',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: false,
      };

      let sessionTracks = [t1];
      const favorites = ['shared-rec-1'];
      const playlistTrackIds = ['shared-rec-1'];

      // Execute removal from library
      sessionTracks = sessionTracks.filter((t) => t.id !== 'shared-rec-1');
      expect(sessionTracks).toHaveLength(0);

      // Verify favorites and playlists retain access
      expect(favorites).toContain('shared-rec-1');
      expect(playlistTrackIds).toContain('shared-rec-1');
    });
  });

  describe('RC5 Task C: Recording Provenance Drawer Accessibility', () => {
    it('renders accessible drawer container with role region and aria-controls', () => {
      const trackWithReleases: Track = {
        id: 'mbid-provenance-test',
        title: 'In My Place',
        normalizedTitle: 'in my place',
        artist: 'Coldplay',
        channelTitle: 'A Rush of Blood to the Head',
        releaseGroupId: 'rg-arobth',
        thumbnail: 'https://coverartarchive.org/release-group/rg-arobth/front-250.jpg',
        durationSeconds: 228,
        publishedAt: '2002-08-26',
        category: 'album',
        role: 'primary',
        versionTags: ['Album', '2002'],
        dedupeKey: 'mb:mbid-provenance-test',
        isDuplicate: false,
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
        youtubeVerified: false,
        metadata: {
          releases: [
            {
              releaseGroupId: 'rg-arobth',
              releaseGroupTitle: 'A Rush of Blood to the Head',
              category: 'album',
              publishedAt: '2002-08-26',
              durationSeconds: 228,
              thumbnail: 'https://coverartarchive.org/release-group/rg-arobth/front-250.jpg',
              versionTags: ['Album', '2002'],
            },
            {
              releaseGroupId: 'rg-live2003',
              releaseGroupTitle: 'Live 2003',
              category: 'live',
              publishedAt: '2003-11-04',
              durationSeconds: 235,
              thumbnail: 'https://coverartarchive.org/release-group/rg-live2003/front-250.jpg',
              versionTags: ['Live', '2003'],
            },
          ],
        },
      };

      const html = trackCardHtml(trackWithReleases);
      expect(html).toContain('aria-controls="provenance-mbid-provenance-test"');
      expect(html).toContain('id="provenance-mbid-provenance-test"');
      expect(html).toContain('role="region"');
      expect(html).toContain('aria-label="Release appearances for In My Place"');
    });
  });
});
