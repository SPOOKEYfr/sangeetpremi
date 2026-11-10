/** Lightweight accessible toast notifications. */
import { icon } from './icons';

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    container.style.cssText =
      'position:fixed;bottom:22px;right:22px;display:flex;flex-direction:column;gap:10px;z-index:9999;max-width:calc(100vw - 44px);pointer-events:none;';
    document.body.appendChild(container);
  }
  return container;
}

export function toast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  const color = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--accent)';
  const iconName = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';

  el.className = 'clay clay-sm fade-in';
  el.style.cssText = `pointer-events:auto;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:14px;font-size:13.5px;max-width:380px;border-left:4px solid ${color};background:linear-gradient(145deg,var(--bg-3),var(--bg-2));box-shadow:var(--shadow-raised);color:var(--text-1);`;

  el.innerHTML = `
    <span style="color:${color};flex:none;display:flex">${icon(iconName, 16)}</span>
    <span style="flex:1;min-width:0;line-height:1.4">${message}</span>
    <button class="toast-close" style="background:transparent;border:none;color:var(--text-3);cursor:pointer;padding:2px;font-size:14px;line-height:1;margin-left:4px" aria-label="Dismiss notification">✕</button>
  `;

  const dismiss = () => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(12px)';
    setTimeout(() => el.remove(), 260);
  };

  el.querySelector('.toast-close')?.addEventListener('click', dismiss);

  ensureContainer().appendChild(el);
  setTimeout(dismiss, 3800);
}
