/** SangeetPremi brand mark — inline SVG so it works everywhere, no assets needed. */
export function logoSvg(size = 34): string {
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="spg" x1="0" y1="0" x2="48" y2="48">
        <stop stop-color="#9a8bff"/><stop offset="1" stop-color="#5fd4c4"/>
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#spg)"/>
    <path d="M17 33.5v-19l16-3.5v19" stroke="#14121f" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="13.5" cy="33.5" r="4.6" fill="#14121f"/>
    <circle cx="29.5" cy="30" r="4.6" fill="#14121f"/>
  </svg>`;
}

export function brandHeader(size = 34): HTMLElement {
  const el = document.createElement('div');
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.gap = '12px';
  el.innerHTML = `${logoSvg(size)}<span style="font-size:19px;font-weight:700;letter-spacing:-0.01em">Sangeet<span style="color:var(--accent)">Premi</span></span>`;
  return el;
}
