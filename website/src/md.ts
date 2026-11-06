/**
 * Minimal, safe Markdown -> HTML renderer for the draft legal documents.
 * Everything is HTML-escaped FIRST; only then are a small set of Markdown
 * constructs (headings, bold, italic, code, links, lists, paragraphs,
 * blockquotes) transformed. No raw HTML from the source is ever emitted,
 * so the draft files cannot inject markup into the site.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  let inQuote = false;
  const closeBlocks = () => {
    if (inList) { out.push('</ul>'); inList = false; }
    if (inQuote) { out.push('</blockquote>'); inQuote = false; }
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^>\s?/.test(line)) {
      closeBlocks();
      if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
      out.push(`<p>${inline(esc(line.replace(/^>\s?/, '')))}</p>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (inQuote) { out.push('</blockquote>'); inQuote = false; }
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(esc(line.replace(/^[-*]\s+/, '')))}</li>`);
      continue;
    }
    closeBlocks();
    if (line === '') continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(esc(h[2]))}</h${level}>`);
    } else if (/^```/.test(line)) {
      // fenced code blocks are rendered as a single escaped block
      out.push('<pre><code>(code block omitted in web rendering)</code></pre>');
    } else {
      out.push(`<p>${inline(esc(line))}</p>`);
    }
  }
  closeBlocks();
  return out.join('\n');
}
