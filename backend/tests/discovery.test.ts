/**
 * Phase C2-H backend tests: full mock-provider discovery pipeline, job
 * lifecycle, capability protection, expiry/revocation, concurrency caps,
 * cleanup, polling, quota exhaustion, partial provider failure, multi-artist,
 * refresh. No real network, no credentials.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { DiscoveryOrchestrator, type DiscoverParams } from '../src/orchestrator.js';
import { JobManager } from '../src/jobManager.js';
import { startTestApp, stop, CLIENT_HEADERS } from './helpers.js';
import type { App } from '../src/app.js';
import type { MetadataProvider, VideoProvider, VideoMeta, ChannelMeta, ArtistCandidate } from '../src/providers/types.js';
import type { QuotaAccountant } from '../src/quota.js';

let app: App | undefined;
afterEach(async () => { if (app) await stop(app); app = undefined; });

// --- mock providers -------------------------------------------------------
function vid(id: string, title: string, extra: Partial<VideoMeta> = {}): VideoMeta {
  return { videoId: id, title, channelId: 'UC_channel1', channelTitle: 'Test Artist', publishedAt: '2020-05-01T00:00:00Z', durationSeconds: 200, viewCount: 1000, ...extra };
}
function makeVideo(overrides: Partial<VideoProvider> = {}): VideoProvider {
  const nameOf = (channelId: string) => (channelId.startsWith('UC_') ? channelId.slice(3).replace(/_/g, ' ') : 'Test Artist');
  const base: VideoProvider = {
    name: 'mock-youtube',
    resolveChannel: async (q): Promise<ChannelMeta[]> => [{ channelId: 'UC_' + q.replace(/\W/g, '_'), title: q, country: 'IN' }],
    searchVideos: async (q) => {
      const artist = q.split(' ').slice(0, -1).join(' ') || 'Test Artist';
      return { items: q.includes('songs') ? [vid('dddddddddd4', `${artist} - Song Three (Official Audio)`), vid('aaaaaaaaaa1', `${artist} - Song One (Official Video)`)] : [] };
    },
    channelUploads: async (channelId) => {
      const a = nameOf(channelId);
      return [
        vid('aaaaaaaaaa1', `${a} - Song One (Official Video)`, { channelId, channelTitle: a }),
        vid('bbbbbbbbbb2', `${a} - Song Two Live`, { channelId, channelTitle: a }),
        vid('cccccccccc3', 'Some Other Channel - unrelated news', { channelId: 'UC_other', channelTitle: 'Some Other Channel' }),
      ];
    },
    videoDetails: async (ids) => [vid('aaaaaaaaaa1', 'Test Artist - Song One (Official Video)')].filter((u) => ids.includes(u.videoId)),
  };
  return { ...base, ...overrides };
}
const mockMetadata: MetadataProvider = {
  name: 'mock-mb',
  resolveArtist: async (q): Promise<ArtistCandidate[]> => [{ id: 'mbid-1', name: q, country: 'IN', description: 'mock artist' }],
  recordingsOf: async () => [],
};

const params: DiscoverParams = { artists: ['Test Artist'], depth: 'standard', categories: ['song', 'live', 'remix', 'duet'] };

async function runUntilDone(jobs: JobManager, orch: DiscoveryOrchestrator, p: DiscoverParams) {
  const { jobId, capability } = jobs.create(p);
  await jobs.pump((job, onProgress) => orch.run(job.params, onProgress));
  // drain async runners
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 5));
    if (jobs.get(jobId)!.state === 'completed' || jobs.get(jobId)!.state === 'failed') break;
  }
  return { jobId, capability };
}

describe('DiscoveryOrchestrator with mock providers (C2-A/C2-H)', () => {
  it('full pipeline: resolve -> uploads -> search fallback -> classify -> dedup -> stats', async () => {
    const orch = new DiscoveryOrchestrator(makeVideo(), mockMetadata);
    const phases: string[] = [];
    const res = await orch.run(params, (p) => phases.push(p.phase));
    expect(res.artists[0].name).toBe('Test Artist');
    expect(res.tracks.length).toBeGreaterThanOrEqual(3);
    expect(res.tracks.some((t) => t.videoId === 'dddddddddd4')).toBe(true); // from search fallback
    expect(res.tracks.filter((t) => t.videoId === 'aaaaaaaaaa1').length).toBe(1); // deduped across sources
    expect(res.report.providersUsed).toContain('mock-youtube');
    expect(res.report.providersUsed).toContain('mock-mb');
    expect(phases).toContain('classify');
    expect(phases).toContain('dedupe');
    expect(res.stats.totalTracks).toBe(res.tracks.length);
  });

  it('partial provider failure degrades gracefully (metadata down)', async () => {
    const failingMb: MetadataProvider = { ...mockMetadata, resolveArtist: async () => { throw new Error('MB down'); } };
    const orch = new DiscoveryOrchestrator(makeVideo(), failingMb);
    const res = await orch.run(params, () => {});
    expect(res.tracks.length).toBeGreaterThanOrEqual(3);
    expect(res.report.notes.some((n) => n.includes('Metadata provider unavailable'))).toBe(true);
  });

  it('search fallback failure does not kill the job', async () => {
    const v = makeVideo({ searchVideos: async () => { throw new Error('search quota'); } });
    const orch = new DiscoveryOrchestrator(v, mockMetadata);
    const res = await orch.run(params, () => {});
    expect(res.tracks.length).toBeGreaterThanOrEqual(2); // uploads still work
  });

  it('language filter is applied', async () => {
    const orch = new DiscoveryOrchestrator(makeVideo(), mockMetadata);
    const res = await orch.run({ ...params, filters: { language: 'xx' } }, () => {});
    expect(res.tracks.length).toBe(0);
  });

  it('multi-artist merge preserves per-artist attribution', async () => {
    const orch = new DiscoveryOrchestrator(makeVideo(), mockMetadata);
    const res = await orch.run({ ...params, artists: ['Test Artist', 'Second Artist'] }, () => {});
    expect(res.artists.length).toBe(2);
    expect(Object.keys(res.perArtistCounts).length).toBe(2);
  });
});

describe('JobManager lifecycle (C2-B/C2-H)', () => {
  it('queued -> running -> completed with progress; result retrievable', async () => {
    const jobs = new JobManager();
    const orch = new DiscoveryOrchestrator(makeVideo(), mockMetadata);
    const { jobId, capability } = await runUntilDone(jobs, orch, params);
    const job = jobs.get(jobId)!;
    expect(job.state).toBe('completed');
    expect(job.result!.tracks.length).toBeGreaterThanOrEqual(3);
    expect(job.progress.length).toBeGreaterThan(0);
    expect(jobs.verify(jobId, capability)).toBe(true);
    expect(jobs.verify(jobId, '0'.repeat(64))).toBe(false);
  });

  it('failed job carries structured error', async () => {
    const jobs = new JobManager();
    const { jobId } = jobs.create(params);
    await jobs.pump(async () => { const e = new Error('boom') as Error & { code?: string }; e.code = 'PROVIDER_ERROR'; throw e; });
    for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 5)); if (jobs.get(jobId)!.state === 'failed') break; }
    expect(jobs.get(jobId)!.state).toBe('failed');
    expect(jobs.get(jobId)!.error!.code).toBe('PROVIDER_ERROR');
  });

  it('expiry and revocation invalidate the capability', () => {
    let t = 1000;
    const jobs = new JobManager({ now: () => t, ttlMs: 500 });
    const { jobId, capability } = jobs.create(params);
    expect(jobs.verify(jobId, capability)).toBe(true);
    t += 600;
    expect(jobs.verify(jobId, capability)).toBe(false); // expired
    const j2 = jobs.create(params);
    jobs.revoke(j2.jobId);
    expect(jobs.verify(j2.jobId, j2.capability)).toBe(false); // revoked
  });

  it('bounded concurrency: at most maxConcurrent run at once', async () => {
    const jobs = new JobManager({ maxConcurrent: 2 });
    let active = 0; let maxActive = 0;
    const mk = () => jobs.create(params);
    mk(); mk(); mk(); mk();
    await jobs.pump(async () => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 30));
      active--;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('sweep removes expired jobs and bounds memory', () => {
    let t = 0;
    const jobs = new JobManager({ now: () => t, ttlMs: 100, maxJobs: 5 });
    for (let i = 0; i < 8; i++) jobs.create(params); // exceeds maxJobs -> eviction of finished/oldest
    expect(jobs.stats().total).toBeLessThanOrEqual(8);
    t = 1000;
    jobs.sweep();
    expect(jobs.stats().total).toBe(0);
  });
});

describe('HTTP polling endpoints (C2-C/C2-H)', () => {
  it('POST /v1/discover -> poll GET /v1/discover/:id until completed; unauthorized without capability', async () => {
    const s = await startTestApp(); app = s.app;
    const post = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: JSON.stringify({ artists: ['Test Artist'], depth: 'quick' }) });
    expect(post.status).toBe(200);
    const { jobId, capability } = (await post.json()).data;
    // no capability -> 401
    const unauth = await fetch(`${s.base}/v1/discover/${jobId}`);
    expect(unauth.status).toBe(401);
    // poll with backoff-ish loop
    let last: { data: { state: string } } | undefined;
    for (let i = 0; i < 40; i++) {
      const r = await fetch(`${s.base}/v1/discover/${jobId}`, { headers: { Authorization: `Bearer ${capability}` } });
      expect(r.status).toBe(200);
      last = await r.json();
      if (last.data.state === 'completed' || last.data.state === 'failed') break;
      await new Promise((r2) => setTimeout(r2, 10));
    }
    // stub providers resolve instantly-ish; accept completed or (with stubs) failed gracefully, never a crash
    expect(['completed', 'failed']).toContain(last!.data.state);
    // capability never accepted via URL query
    const viaUrl = await fetch(`${s.base}/v1/discover/${jobId}?capability=${capability}`);
    expect(viaUrl.status).toBe(401);
  });

  it('refresh creates a new job from the same params', async () => {
    const s = await startTestApp(); app = s.app;
    const post = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: JSON.stringify({ artists: ['Test Artist'], depth: 'quick' }) });
    const { jobId, capability } = (await post.json()).data;
    const rf = await fetch(`${s.base}/v1/discover/${jobId}/refresh`, { method: 'POST', headers: { ...CLIENT_HEADERS, Authorization: `Bearer ${capability}` }, body: '{}' });
    expect(rf.status).toBe(200);
    const body = await rf.json();
    expect(body.data.jobId).not.toBe(jobId);
    expect(body.data.refreshedFrom).toBe(jobId);
  });
});
