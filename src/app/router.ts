/** Minimal hash router for the dashboard. */
export type Route = 'home' | 'discover' | 'library' | 'playlists' | 'settings' | 'about';

export interface RouteChange {
  route: Route;
  params: URLSearchParams;
}

const VALID: Route[] = ['home', 'discover', 'library', 'playlists', 'settings', 'about'];

export function parseHash(): RouteChange {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const route = (VALID.includes(path as Route) ? path : 'home') as Route;
  return { route, params: new URLSearchParams(query) };
}

export function navigate(route: Route, params?: Record<string, string>): void {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  location.hash = `#/${route}${qs}`;
}

export function onRouteChange(fn: (c: RouteChange) => void): () => void {
  const handler = () => fn(parseHash());
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}
