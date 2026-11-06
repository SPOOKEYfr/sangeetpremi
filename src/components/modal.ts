/** Simple modal dialog built on claymorphism primitives. */
import { escapeHtml } from '../utils/sanitize';
export function openModal(title: string, body: HTMLElement | string, actions: { label: string; kind?: 'primary' | 'teal' | 'danger' | 'ghost'; onClick: () => void | Promise<void> }[]): { close: () => void } {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,12,.66);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9000;padding:20px';
  const card = document.createElement('div');
  card.className = 'clay fade-in';
  card.style.cssText = 'width:min(520px,100%);padding:26px;max-height:85vh;overflow:auto';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3>${escapeHtml(title)}</h3>
      <button class="btn btn-ghost btn-sm modal-close" style="border-radius:10px">✕</button>
    </div>
    <div class="modal-body"></div>
    <div class="modal-actions" style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px"></div>`;
  const bodyEl = card.querySelector('.modal-body') as HTMLElement;
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.appendChild(body);
  const actionsEl = card.querySelector('.modal-actions') as HTMLElement;
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn btn-sm ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'teal' ? 'btn-teal' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost'}`;
    b.textContent = a.label;
    b.addEventListener('click', () => void a.onClick());
    actionsEl.appendChild(b);
  }
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  card.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  return { close };
}
