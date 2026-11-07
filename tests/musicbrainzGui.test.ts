import { describe, expect, it } from 'vitest';
import {
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
    const mbid = 'c0f99dc2-3580-3be2-8926-ec4be135064e';
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
      id: 'rec-coldplay-yellow',
      title: 'Yellow',
      artistCredit: 'Coldplay',
      artistMbid: 'cc197084-882d-4221-8224-34e73e515269',
      releaseGroupTitle: 'Parachutes',
      releaseGroupMbid: 'c0f99dc2-3580-3be2-8926-ec4be135064e',
      releaseType: 'Album',
      releaseDate: '2000-07-10',
      durationSeconds: 269,
      coverArtUrl: 'https://coverartarchive.org/release-group/c0f99dc2-3580-3be2-8926-ec4be135064e/front-250.jpg',
      youtubeStream: undefined,
    };

    const track = canonicalRecordingToTrack(rec, 'Coldplay');

    expect(track.id).toBe('rec-coldplay-yellow');
    expect(track.title).toBe('Yellow');
    expect(track.artist).toBe('Coldplay');
    expect(track.category).toBe('album');
    expect(track.viewCount).toBeUndefined(); // Zero YouTube view counts
    expect(track.isDuplicate).toBe(false);
    expect(track.versionTags).toContain('Album');
    expect(track.versionTags).toContain('2000');
    // Until genuine relationship API from OpenCode is supplied, Yellow does NOT display Watch
    expect(hasVerifiedRecordingStream(track)).toBe(false);

    const html = trackCardHtml(track);
    expect(html).toContain('Unmapped');
    expect(html).not.toContain('Watch ↗');
  });

  it('preserves unmapped recording status honestly with NO YouTube search fallback link', () => {
    const rec: CanonicalRecording = {
      id: 'rec-dont-panic-mbid',
      title: "Don't Panic",
      artistCredit: 'Coldplay',
      artistMbid: 'cc197084-882d-4221-8224-34e73e515269',
      releaseGroupTitle: 'Parachutes',
      releaseGroupMbid: 'c0f99dc2-3580-3be2-8926-ec4be135064e',
      releaseType: 'Album',
      releaseDate: '2000-07-10',
      durationSeconds: 137,
      youtubeStream: undefined, // Honest unmapped status
    };

    const track = canonicalRecordingToTrack(rec, 'Coldplay');

    expect(track.id).toBe('rec-dont-panic-mbid');
    expect(track.videoId).toBeUndefined();
    expect(track.youtubeVideoId).toBeUndefined();
    expect(track.youtubeVerified).toBe(false);
    expect(hasVerifiedRecordingStream(track)).toBe(false);
    expect(track.viewCount).toBeUndefined();

    // Track card HTML must render honest Unmapped state and MUST NOT include YouTube search fallback link
    const html = trackCardHtml(track);
    expect(html).toContain('Unmapped');
    expect(html).not.toContain('Search YouTube');
    expect(html).not.toContain('youtube.com/results');
  });

  it('clearly identifies curated offline catalogue entries as preview/demo data in fallback mode', async () => {
    const artists = await searchMusicBrainzArtists('Coldplay', { allowPreviewFallback: true });
    expect(artists.length).toBeGreaterThan(0);
    expect(artists[0].isCuratedPreview).toBe(true);

    const discography = await loadArtistDiscography('cc197084-882d-4221-8224-34e73e515269', { allowPreviewFallback: true });
    expect(discography.artist.isCuratedPreview).toBe(true);
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
