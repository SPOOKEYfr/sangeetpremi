/** Accessible modal dialog built on claymorphism primitives. */
export function openModal(
  title: string,
  body: HTMLElement | string,
  actions: { label: string; kind?: 'primary' | 'teal' | 'danger' | 'ghost'; onClick: (close: () => void) => void | Promise<void> }[],
): { close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(8,9,12,.72);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;z-index:9000;padding:20px;animation:fadeIn 180ms ease;';

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  const card = document.createElement('div');
  card.className = 'clay fade-in';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', titleId);
  card.style.cssText = 'width:min(520px,100%);padding:26px;max-height:85vh;overflow:auto;outline:none;';
  card.tabIndex = -1;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 id="${titleId}">${title}</h3>
      <button class="btn btn-ghost btn-sm modal-close" style="border-radius:10px;padding:6px 10px" aria-label="Close dialog">✕</button>
    </div>
    <div class="modal-body"></div>
    <div class="modal-actions" style="display:flex;gap:10px;justify-content:flex-end;margin-top:22px;flex-wrap:wrap"></div>`;

  const bodyEl = card.querySelector('.modal-body') as HTMLElement;
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.appendChild(body);

  const close = () => {
    window.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const actionsEl = card.querySelector('.modal-actions') as HTMLElement;
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn btn-sm ${
      a.kind === 'primary' ? 'btn-primary' : a.kind === 'teal' ? 'btn-teal' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost'
    }`;
    b.textContent = a.label;
    b.addEventListener('click', async () => {
      try {
        await a.onClick(close);
      } catch (err) {
        console.error('Modal action error:', err);
      }
      if (a.kind === 'ghost' || a.label.toLowerCase() === 'cancel') {
        close();
      }
    });
    actionsEl.appendChild(b);
  }

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  window.addEventListener('keydown', onKeyDown);
  card.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Focus the dialog card or its primary action
  card.focus();

  return { close };
}
