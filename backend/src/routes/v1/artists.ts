import type { RouteHandler } from '../../http/router.js';
import { err } from '../../http/responses.js';
import { requireString } from '../../middleware/validate.js';
import type { MetadataProvider } from '../../providers/types.js';

/** GET /v1/artists/resolve?q=... — validated contract; provider wiring is Phase C. */
export function resolveArtistHandler(provider: MetadataProvider): RouteHandler {
  return async (ctx) => {
    const q = requireString(ctx.query.get('q'), 'q', 1, 100);
    const results = await provider.resolveArtist(q); // stub throws NOT_IMPLEMENTED in Phase B
    void results;
    throw err.notImplemented('Artist resolution provider is not wired in Phase B.');
  };
}
