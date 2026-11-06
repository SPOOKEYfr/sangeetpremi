/** Minimal method+pattern router. Patterns like "/v1/discover/:id" capture params. */
export interface RouteContext<P = Record<string, string>> {
  params: P;
  query: URLSearchParams;
  body: unknown; // parsed JSON body (undefined for GET)
  rawBody: Buffer;
}

export type RouteHandler<P = Record<string, string>> = (ctx: RouteContext<P>) => unknown | Promise<unknown>;

interface Route {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: RouteHandler): void {
    this.routes.push({ method: method.toUpperCase(), segments: pattern.split('/').filter(Boolean), handler });
  }

  get(pattern: string, h: RouteHandler): void { this.add('GET', pattern, h); }
  post(pattern: string, h: RouteHandler): void { this.add('POST', pattern, h); }

  match(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
    const segs = pathname.split('/').filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method.toUpperCase()) continue;
      if (r.segments.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let okMatch = true;
      for (let i = 0; i < segs.length; i++) {
        const rs = r.segments[i];
        if (rs.startsWith(':')) params[rs.slice(1)] = decodeURIComponent(segs[i]);
        else if (rs !== segs[i]) { okMatch = false; break; }
      }
      if (okMatch) return { handler: r.handler, params };
    }
    return null;
  }

  /** True if any route matches the path with a different method (for 405 responses). */
  hasPath(pathname: string): boolean {
    const segs = pathname.split('/').filter(Boolean);
    return this.routes.some((r) => r.segments.length === segs.length && r.segments.every((rs, i) => rs.startsWith(':') || rs === segs[i]));
  }
}
