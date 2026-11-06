/**
 * Content script on YouTube pages: adds a subtle "Discover this artist in
 * SangeetPremi" affordance on channel pages. Read-only — never modifies
 * YouTube content, never extracts data beyond what the page already shows.
 */
function addAffordance(): void {
  if (document.querySelector('#sangeetpremi-cta')) return;
  const m = location.pathname.match(/^\/@([^/]+)/) ?? location.pathname.match(/^\/channel\/([^/]+)/);
  if (!m) return;
  const btn = document.createElement('button');
  btn.id = 'sangeetpremi-cta';
  btn.textContent = '🎵 Discover in SangeetPremi';
  btn.style.cssText =
    'position:fixed;right:18px;bottom:18px;z-index:2147483000;padding:10px 16px;border-radius:12px;border:none;' +
    'background:linear-gradient(145deg,#9a8bff,#8b7cf6);color:#14121f;font-weight:700;font-size:13px;cursor:pointer;' +
    'box-shadow:0 6px 18px rgba(0,0,0,.4);font-family:system-ui,sans-serif';
  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'sangeetpremi:open-dashboard', query: decodeURIComponent(m[1] ?? '') });
  });
  document.body.appendChild(btn);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addAffordance);
} else {
  addAffordance();
}
