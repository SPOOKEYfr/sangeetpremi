import type { RouteHandler } from '../../http/router.js';
import { err } from '../../http/responses.js';
import { requireVideoId } from '../../middleware/validate.js';
import type { VideoProvider } from '../../providers/types.js';

/** GET /v1/videos/:id — validated contract; provider wiring is Phase C. */
export function getVideoHandler(provider: VideoProvider): RouteHandler {
  return async (ctx) => {
    const id = requireVideoId(ctx.params.id);
    const results = await provider.videoDetails([id]); // stub throws NOT_IMPLEMENTED in Phase B
    void results;
    throw err.notImplemented('Video provider is not wired in Phase B.');
  };
}
