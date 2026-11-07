/** Minimal stroke icon set (inline SVG, currentColor). */
const wrap = (path: string, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

export const icons = {
  search: wrap('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  play: wrap('<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>'),
  heart: wrap('<path d="M12 20.5C7 16.5 3 13.3 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.5 0 4.7 1.9 4.7 4.8 0 4-4 7.2-9 11.2z"/>'),
  clock: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>'),
  list: wrap('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor"/>'),
  grid: wrap('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.15-1.4l2-1.55-2-3.46-2.35.95a7 7 0 0 0-2.4-1.4L13.7 2.6h-3.4l-.4 2.55a7 7 0 0 0-2.4 1.4l-2.35-.95-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .48.05.94.15 1.4l-2 1.55 2 3.46 2.35-.95a7 7 0 0 0 2.4 1.4l.4 2.55h3.4l.4-2.55a7 7 0 0 0 2.4-1.4l2.35.95 2-3.46-2-1.55c.1-.46.15-.92.15-1.4z"/>'),
  home: wrap('<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>'),
  library: wrap('<path d="M4 4.5v15h16"/><path d="M8 4.5v15"/><path d="M11.5 8l4.5 11"/>'),
  info: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  trash: wrap('<path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13"/>'),
  download: wrap('<path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M4.5 19.5h15"/>'),
  youtube: wrap('<rect x="2.5" y="6" width="19" height="12.5" rx="3.5"/><path d="M10.2 9.6v5.3l4.8-2.65z" fill="currentColor" stroke="none"/>'),
  external: wrap('<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5H10"/>'),
  check: wrap('<path d="m4.5 12.5 5 5 10-11"/>'),
  x: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  music: wrap('<path d="M9 18.5V6l11-2.5V16"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  sparkles: wrap('<path d="M12 4l1.8 4.6L18.5 10l-4.7 1.4L12 16l-1.8-4.6L5.5 10l4.7-1.4z"/><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>'),
  drag: wrap('<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>'),
  filter: wrap('<path d="M4 5h16l-6.2 7.2V19l-3.6-2v-4.8z"/>'),
  eye: wrap('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: wrap('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>'),
  alert: wrap('<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  refresh: wrap('<path d="M21.5 2v6h-6M2.5 22v-6h6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L21.5 8M3.51 9a9 9 0 0 1 2.12 9.36L2.5 16"/>'),
  arrowRight: wrap('<path d="M5 12h14M12 5l7 7-7 7"/>'),
  shield: wrap('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  copy: wrap('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
};

export function icon(name: keyof typeof icons, size = 18): string {
  return icons[name]!.replace('width="18"', `width="${size}"`).replace('height="18"', `height="${size}"`);
}
