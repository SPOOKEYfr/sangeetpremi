/**
 * Safe DOM construction helpers. Prefer these over innerHTML when any part of
 * the input is dynamic/untrusted: strings become textContent (never parsed as
 * HTML), attribute values are set via setAttribute (never parsed as markup).
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    el.append(c); // strings append as text nodes — impossible to inject markup
  }
  return el;
}
