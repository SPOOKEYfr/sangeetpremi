import { describe, expect, it } from 'vitest';
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
} from '../src/features/discovery/musicbrainzClient';
import { trackCardHtml } from '../src/components/trackCard';
import type { Track } from '../src/types';
import type { MusicBrainzRecordingYouTubeRelationship } from '../src/services/musicbrainz/index';

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
      id: 'bd128a1c-ec81-428a-82cf-f9261a8ef181',
      title: "Don't Panic",
      artistCredit: 'Coldplay',
      artistMbid: 'cc197bad-dc9c-440d-a5b5-d52ba2e14234',
      releaseGroupTitle: 'Parachutes',
      releaseGroupMbid: '1dc4c347-a1db-32aa-b14f-bc9cc507b843',
      releaseType: 'Album',
      releaseDate: '2000-07-10',
      durationSeconds: 137,
      youtubeStream: undefined, // Honest unmapped status
    };

    const track = canonicalRecordingToTrack(rec, 'Coldplay');

    const unmappedRel: MusicBrainzRecordingYouTubeRelationship = {
      recordingMBID: 'bd128a1c-ec81-428a-82cf-f9261a8ef181',
      recordingTitle: "Don't Panic",
      artistCredit: ['Coldplay'],
      lengthSeconds: 137,
      isrc: 'GBAYE0000511',
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

    expect(track.id).toBe('bd128a1c-ec81-428a-82cf-f9261a8ef181');
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

  it('clearly identifies curated offline catalogue entries as preview/demo data in fallback mode', async () => {
    const artists = await searchMusicBrainzArtists('Coldplay', { allowPreviewFallback: true });
    expect(artists.length).toBeGreaterThan(0);
    expect(artists[0].id).toBe('cc197bad-dc9c-440d-a5b5-d52ba2e14234');
    expect(artists[0].isCuratedPreview).toBe(true);

    const discography = await loadArtistDiscography('cc197bad-dc9c-440d-a5b5-d52ba2e14234', { allowPreviewFallback: true });
    expect(discography.artist.isCuratedPreview).toBe(true);
    expect(discography.releaseGroups.some((rg) => rg.id === '1dc4c347-a1db-32aa-b14f-bc9cc507b843')).toBe(true);
    expect(discography.recordings.some((r) => r.id === '729cf505-94eb-4fbe-bc76-cbae44cff091')).toBe(true);
  });

  it('handles artist disambiguation for ambiguous search queries with preview markers in fallback mode', async () => {
    const rahmanMatches = await searchMusicBrainzArtists('rahman', { allowPreviewFallback: true });
    expect(rahmanMatches.length).toBeGreaterThanOrEqual(2);
    expect(rahmanMatches[0].name).toBe('A.R. Rahman');
    expect(rahmanMatches[0].isCuratedPreview).toBe(true);
    expect(rahmanMatches.some((a) => a.name.includes('Reihana'))).toBe(true);

    const nirvanaMatches = await searchMusicBrainzArtists('nirvana', { allowPreviewFallback: true });
    expect(nirvanaMatches.length).toBeGreaterThanOrEqual(2);
    expect(nirvanaMatches.some((a) => a.disambiguation?.includes('grunge'))).toBe(true);
    expect(nirvanaMatches.some((a) => a.disambiguation?.includes('psychedelic'))).toBe(true);
  });
});
