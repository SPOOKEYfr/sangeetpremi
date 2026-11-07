import { describe, expect, it } from 'vitest';
import {
  canonicalRecordingToTrack,
  isVerifiedYouTubeId,
  releaseTypeToCategory,
  coverArtArchiveUrl,
  type CanonicalRecording,
} from '../src/features/discovery/musicbrainzModel';
import {
  searchMusicBrainzArtists,
  loadArtistDiscography,
} from '../src/features/discovery/musicbrainzClient';

describe('MusicBrainz Frontend Models & Discovery', () => {
  it('identifies verified YouTube stream IDs vs unmapped canonical IDs', () => {
    expect(isVerifiedYouTubeId('yKNxeF4KMsY')).toBe(true);
    expect(isVerifiedYouTubeId('dvgZkm1xWPE')).toBe(true);
    expect(isVerifiedYouTubeId('mb-6f5b9d21-f093')).toBe(false);
    expect(isVerifiedYouTubeId('')).toBe(false);
    expect(isVerifiedYouTubeId('invalid_id')).toBe(false);
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

  it('converts canonical recording to Track without YouTube view counts or inferred categories', () => {
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
      youtubeStream: { videoId: 'yKNxeF4KMsY', verified: true },
    };

    const track = canonicalRecordingToTrack(rec, 'Coldplay');

    expect(track.id).toBe('yKNxeF4KMsY');
    expect(track.videoId).toBe('yKNxeF4KMsY');
    expect(track.title).toBe('Yellow');
    expect(track.artist).toBe('Coldplay');
    expect(track.category).toBe('album');
    expect(track.viewCount).toBeUndefined(); // Zero YouTube view counts
    expect(track.isDuplicate).toBe(false);
    expect(track.versionTags).toEqual(['Album', '2000']);
  });

  it('preserves unmapped recording status honestly without inventing fake stream IDs', () => {
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

    expect(track.id).toBe('mb-rec-dont-panic-mbid');
    expect(track.videoId).toBe('mb-rec-dont-panic-mbid');
    expect(isVerifiedYouTubeId(track.videoId)).toBe(false);
    expect(track.viewCount).toBeUndefined();
  });

  it('handles artist disambiguation for ambiguous search queries', async () => {
    const rahmanMatches = await searchMusicBrainzArtists('rahman');
    expect(rahmanMatches.length).toBeGreaterThanOrEqual(2);
    expect(rahmanMatches[0].name).toBe('A.R. Rahman');
    expect(rahmanMatches.some((a) => a.name.includes('Reihana'))).toBe(true);

    const nirvanaMatches = await searchMusicBrainzArtists('nirvana');
    expect(nirvanaMatches.length).toBeGreaterThanOrEqual(2);
    expect(nirvanaMatches.some((a) => a.disambiguation?.includes('grunge'))).toBe(true);
    expect(nirvanaMatches.some((a) => a.disambiguation?.includes('psychedelic'))).toBe(true);
  });

  it('loads verified discography release groups and canonical recordings', async () => {
    const coldplayEntry = await loadArtistDiscography('cc197084-882d-4221-8224-34e73e515269');
    expect(coldplayEntry.artist.name).toBe('Coldplay');
    expect(coldplayEntry.releaseGroups.length).toBeGreaterThanOrEqual(5);
    expect(coldplayEntry.releaseGroups.some((rg) => rg.title === 'Parachutes')).toBe(true);
    expect(coldplayEntry.recordings.length).toBeGreaterThanOrEqual(5);

    const yellow = coldplayEntry.recordings.find((r) => r.title === 'Yellow');
    expect(yellow).toBeDefined();
    expect(yellow?.youtubeStream?.verified).toBe(true);
    expect(yellow?.youtubeStream?.videoId).toBe('yKNxeF4KMsY');

    const dontPanic = coldplayEntry.recordings.find((r) => r.title === "Don't Panic");
    expect(dontPanic).toBeDefined();
    expect(dontPanic?.youtubeStream).toBeUndefined(); // Honestly unmapped
  });
});
