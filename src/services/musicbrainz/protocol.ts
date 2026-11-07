/**
 * Narrow message contract between UI contexts and the background-owned
 * MusicBrainz client. Keeping the protocol in one module prevents the
 * dashboard and side-panel from drifting apart.
 */
import type {
  MusicBrainzArtist,
  MusicBrainzArtistCredit,
  MusicBrainzReleaseGroup,
} from '../../types/index';
import type {
  CoverArt,
  MusicBrainzRecordingResult,
  MusicBrainzRecordingYouTubeRelationship,
} from './index';

export const MUSICBRAINZ_REQUEST_TYPE = 'sangeetpremi:musicbrainz:request' as const;
export const MUSICBRAINZ_RESPONSE_TYPE = 'sangeetpremi:musicbrainz:response' as const;

export interface MusicBrainzOperationMap {
  searchArtists: {
    params: { name: string; limit?: number };
    result: MusicBrainzArtist[];
  };
  getArtistByMBID: {
    params: { mbid: string; inc?: string };
    result: MusicBrainzArtist | null;
  };
  getReleaseGroupsByArtistMBID: {
    params: { artistMBID: string; inc?: string; limit?: number };
    result: MusicBrainzReleaseGroup[];
  };
  getRecordingsByArtistMBID: {
    params: { artistMBID: string; inc?: string; limit?: number };
    result: MusicBrainzRecordingResult[];
  };
  getRecordingsByReleaseGroupMBID: {
    params: { releaseGroupMBID: string; inc?: string; limit?: number };
    result: MusicBrainzRecordingResult[];
  };
  getCoverArtArchive: {
    params: { recordingMBID: string };
    result: CoverArt;
  };
  getCoverArtArchiveByReleaseGroupMBID: {
    params: { releaseGroupMBID: string };
    result: CoverArt;
  };
  getArtistCreditsForReleaseGroup: {
    params: { releaseGroupMBID: string };
    result: MusicBrainzArtistCredit[];
  };
  getRecordingYouTubeRelationship: {
    params: { recordingMBID: string };
    result: MusicBrainzRecordingYouTubeRelationship;
  };
}

export type MusicBrainzOperation = keyof MusicBrainzOperationMap;
export type MusicBrainzParams<K extends MusicBrainzOperation> =
  MusicBrainzOperationMap[K]['params'];
export type MusicBrainzResult<K extends MusicBrainzOperation> =
  MusicBrainzOperationMap[K]['result'];

export type MusicBrainzRequest = {
  [K in MusicBrainzOperation]: {
    type: typeof MUSICBRAINZ_REQUEST_TYPE;
    requestId: string;
    operation: K;
    params: MusicBrainzParams<K>;
  };
}[MusicBrainzOperation];

export interface MusicBrainzErrorPayload {
  name: string;
  message: string;
  status?: number;
  retryAfterMs?: number;
}

export type MusicBrainzResponse =
  | {
      type: typeof MUSICBRAINZ_RESPONSE_TYPE;
      requestId: string;
      ok: true;
      result: unknown;
    }
  | {
      type: typeof MUSICBRAINZ_RESPONSE_TYPE;
      requestId: string;
      ok: false;
      error: MusicBrainzErrorPayload;
    };

const OPERATIONS: readonly MusicBrainzOperation[] = [
  'searchArtists',
  'getArtistByMBID',
  'getReleaseGroupsByArtistMBID',
  'getRecordingsByArtistMBID',
  'getRecordingsByReleaseGroupMBID',
  'getCoverArtArchive',
  'getCoverArtArchiveByReleaseGroupMBID',
  'getArtistCreditsForReleaseGroup',
  'getRecordingYouTubeRelationship',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isMusicBrainzRequest(value: unknown): value is MusicBrainzRequest {
  if (!isRecord(value)) return false;
  if (value.type !== MUSICBRAINZ_REQUEST_TYPE) return false;
  if (typeof value.requestId !== 'string' || value.requestId.length === 0) return false;
  if (typeof value.operation !== 'string') return false;
  if (!(OPERATIONS as readonly string[]).includes(value.operation)) return false;
  return isRecord(value.params);
}

export function isMusicBrainzResponse(value: unknown): value is MusicBrainzResponse {
  if (!isRecord(value)) return false;
  if (value.type !== MUSICBRAINZ_RESPONSE_TYPE) return false;
  if (typeof value.requestId !== 'string') return false;
  return typeof value.ok === 'boolean';
}
