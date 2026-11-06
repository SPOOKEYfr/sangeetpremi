/**
 * Shared site chrome: responsive navigation + footer, injected into every
 * page. All links are internal relative paths so the site works from any
 * base path (Cloudflare Pages project URL or custom domain).
 */
export const REPO_URL = 'https://github.com/SPOOKEYfr/sangeetpremi';
export const RELEASES_URL = 'https://github.com/SPOOKEYfr/sangeetpremi/releases';

export interface NavItem { href: string; label: string; }

export const NAV: NavItem[] = [
  { href: './index.html', label: 'Home' },
  { href: './features.html', label: 'Features' },
  { href: './download.html', label: 'Download' },
  { href: './about.html', label: 'About' },
];

function isActive(href: string, page: string): boolean {
  return href.endsWith(page);
}

export function renderLayout(activePage: string): void {
  const nav = document.getElementById('site-nav');
  const footer = document.getElementById('site-footer');
  if (nav) {
    const linkHtml = NAV.map((n) =>
      `<a href="${n.href}" class="nav-link${isActive(n.href, activePage) ? ' active' : ''}"${isActive(n.href, activePage) ? ' aria-current="page"' : ''}>${n.label}</a>`,
    ).join('');
    nav.innerHTML = `
      <div class="nav-inner">
        <a href="./index.html" class="brand" aria-label="SangeetPremi home">
          <img src="./favicon.svg" alt="" width="26" height="26"/>
          <span>Sangeet<em>Premi</em></span>
        </a>
        <button id="nav-toggle" class="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Toggle navigation">
          <span></span><span></span><span></span>
        </button>
        <nav id="nav-links" class="nav-links" aria-label="Main navigation">
          ${linkHtml}
          <a href="${REPO_URL}" class="nav-link nav-cta" target="_blank" rel="noopener noreferrer">GitHub &#8599;</a>
        </nav>
      </div>`;
    const toggle = document.getElementById('nav-toggle');
    const links = document.getElementById('nav-links');
    toggle?.addEventListener('click', () => {
      const open = links?.classList.toggle('open') ?? false;
      toggle.setAttribute('aria-expanded', String(open));
    });
    links?.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => {
        links.classList.remove('open');
        toggle?.setAttribute('aria-expanded', 'false');
      }),
    );
  }
  if (footer) {
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-brand">
          <img src="./favicon.svg" alt="" width="22" height="22"/>
          <span>Sangeet<em>Premi</em></span>
        </div>
        <nav class="footer-links" aria-label="Footer navigation">
          <a href="./features.html">Features</a>
          <a href="./download.html">Download</a>
          <a href="./about.html">About</a>
          <a href="./privacy.html">Privacy</a>
          <a href="./terms.html">Terms</a>
          <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub &#8599;</a>
        </nav>
        <p class="footer-note">Created and developed by <a href="https://github.com/SPOOKEYfr" target="_blank" rel="noopener noreferrer">SPOOKEYfr</a> · GPL-3.0 · Uses the official YouTube Data API v3; playback happens on YouTube.</p>
      </div>`;
  }
  // Page fade-in (subtle, purposeful — respects reduced motion via CSS).
  document.body.classList.add('ready');
}
