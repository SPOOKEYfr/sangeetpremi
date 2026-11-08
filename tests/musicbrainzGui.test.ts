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
} from '../src/features/discovery/discoveryView';
import { trackCardHtml } from '../src/components/trackCard';
import type { Track } from '../src/types';
import type { MusicBrainzRecordingYouTubeRelationship } from '../src/services/musicbrainz/index';

vi.mock('../src/services/musicbrainz/bridge', () => ({
  getUiMusicBrainzClient: () => ({
    searchArtists: vi.fn().mockRejectedValue(new Error('bridge offline in test')),
    getArtistByMBID: vi.fn().mockRejectedValue(new Error('bridge offline in test')),
    getReleaseGroupsByArtistMBID: vi.fn().mockRejectedValue(new Error('bridge offline in test')),
    getRecordingsByArtistMBID: vi.fn().mockRejectedValue(new Error('bridge offline in test')),
    getRecordingsByReleaseGroupMBID: vi.fn().mockRejectedValue(new Error('bridge offline in test')),
    getCoverArtArchive: vi.fn().mockRejectedValue(new Error('bridge offline in test')),
    getCoverArtArchiveByReleaseGroupMBID: vi.fn().mockRejectedValue(new Error('bridge offline in test')),
    getArtistCreditsForReleaseGroup: vi.fn().mockRejectedValue(new Error('bridge offline in test')),
    getRecordingYouTubeRelationship: vi.fn().mockRejectedValue(new Error('bridge offline in test')),
  }),
}));

describe('MusicBrainz Frontend Models & Discovery', () => {
  beforeEach(() => {
    // Isolate unit tests from live external network by default
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('fetch failed (network disabled in unit tests)');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
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
});
