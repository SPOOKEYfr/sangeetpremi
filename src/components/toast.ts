/** Lightweight toast notifications. */
let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:22px;right:22px;display:flex;flex-direction:column;gap:10px;z-index:9999';
    document.body.appendChild(container);
  }
  return container;
}

export function toast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const el = document.createElement('div');
  const color = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--accent)';
  el.className = 'clay clay-sm fade-in';
  el.style.cssText = `padding:12px 18px;border-radius:14px;font-size:13.5px;max-width:340px;border-left:4px solid ${color};background:linear-gradient(145deg,var(--bg-3),var(--bg-2))`;
  el.textContent = message;
  ensureContainer().appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(12px)';
    setTimeout(() => el.remove(), 320);
  }, 3600);
}
