/**
 * SangeetPremi dashboard entry point.
 * Created and developed by SPOOKEYfr.
 */
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import { store } from '../state/store';
import { onRouteChange, parseHash, type Route } from './router';
import { brandHeader } from '../components/logo';
import { icon } from '../components/icons';
import { renderHome } from '../features/home/home';
import { renderDiscover } from '../features/discovery/discoveryView';
import { renderLibrary } from '../features/library/libraryView';
import { renderPlaylists } from '../features/playlists/playlistsView';
import { renderSettings } from '../features/settings/settingsView';
import { renderAbout } from '../features/about/aboutView';

const NAV: { route: Route; label: string; icon: keyof typeof import('../components/icons').icons }[] = [
  { route: 'home', label: 'Home', icon: 'home' },
  { route: 'discover', label: 'Discover', icon: 'search' },
  { route: 'library', label: 'Library', icon: 'library' },
  { route: 'playlists', label: 'Playlists', icon: 'list' },
  { route: 'settings', label: 'Settings', icon: 'settings' },
  { route: 'about', label: 'About', icon: 'info' },
];

async function boot(): Promise<void> {
  await store.init();
  const app = document.getElementById('app')!;
  app.innerHTML = `
  <a href="#view" class="skip-link">Skip to main content</a>
  <div class="app-shell">
    <aside id="sidebar" class="clay app-sidebar" role="navigation" aria-label="Main Navigation">
      <div id="brand" style="padding:4px 10px 18px"></div>
      <nav id="nav" style="display:flex;flex-direction:column;gap:4px"></nav>
      <div style="flex:1"></div>
      <div class="sidebar-footer" style="padding:10px;font-size:11px;color:var(--text-3);line-height:1.5">Created &amp; developed by<br/><strong style="color:var(--text-2)">SPOOKEYfr</strong></div>
    </aside>
    <main id="view" class="app-view" role="main" tabindex="-1"></main>
  </div>`;
  document.getElementById('brand')!.appendChild(brandHeader(36));

  const nav = document.getElementById('nav')!;
  for (const item of NAV) {
    const a = document.createElement('a');
    a.href = `#/${item.route}`;
    a.dataset.route = item.route;
    a.style.cssText =
      'display:flex;align-items:center;gap:11px;padding:11px 14px;border-radius:14px;color:var(--text-2);font-weight:550;font-size:14px;transition:all .15s;text-decoration:none;';
    a.innerHTML = `${icon(item.icon, 18)}<span>${item.label}</span>`;
    a.addEventListener('mouseenter', () => {
      if (a.getAttribute('aria-current') !== 'page') {
        a.style.background = 'rgba(255,255,255,0.05)';
        a.style.color = 'var(--text-1)';
      }
    });
    a.addEventListener('mouseleave', () => {
      if (a.getAttribute('aria-current') !== 'page') {
        a.style.background = 'transparent';
        a.style.color = 'var(--text-2)';
      }
    });
    nav.appendChild(a);
  }

  const view = document.getElementById('view')!;
  const renderers: Record<Route, (el: HTMLElement, p: URLSearchParams) => void | Promise<void>> = {
    home: (el) => void renderHome(el),
    discover: (el, p) => void renderDiscover(el, p),
    library: (el) => void renderLibrary(el),
    playlists: (el, p) => void renderPlaylists(el, p),
    settings: (el) => void renderSettings(el),
    about: (el) => void renderAbout(el),
  };

  function render(): void {
    const { route, params } = parseHash();
    document.title = `SangeetPremi — ${NAV.find((n) => n.route === route)?.label ?? ''}`;
    for (const a of nav.querySelectorAll('a')) {
      const active = a.getAttribute('data-route') === route;
      a.style.background = active ? 'var(--accent-soft)' : 'transparent';
      a.style.color = active ? '#d3ccff' : 'var(--text-2)';
      a.style.fontWeight = active ? '700' : '550';
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    view.innerHTML = '';
    void renderers[route](view, params);
  }

  onRouteChange(render);
  render();
}

boot().catch((e) => {
  document.getElementById('app')!.innerHTML = `<div class="empty-state"><div class="glyph">⚠️</div><h3>Failed to start SangeetPremi</h3><p>${String(e)}</p></div>`;
});
