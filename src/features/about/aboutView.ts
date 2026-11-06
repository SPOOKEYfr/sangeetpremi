/** About page — credits SPOOKEYfr as creator/developer. */
import { logoSvg } from '../../components/logo';

export function renderAbout(el: HTMLElement): void {
  el.innerHTML = `
  <div class="fade-in" style="max-width:680px">
    <section class="clay" style="padding:38px 40px;text-align:center">
      <div style="display:flex;justify-content:center;margin-bottom:18px">${logoSvg(84)}</div>
      <h1 style="font-size:34px">Sangeet<span style="color:var(--accent)">Premi</span></h1>
      <p style="margin:12px auto 4px;max-width:440px">Search an artist. Discover their music. Enjoy everything in one place.</p>
      <p style="color:var(--text-3);font-size:13px">Version 0.1.0 · Browser extension (Manifest V3)</p>
    </section>
    <section class="clay" style="padding:26px 30px;margin-top:22px">
      <h3 style="margin-bottom:12px">Credits</h3>
      <p><strong>Created and developed by SPOOKEYfr</strong></p>
      <p style="font-size:13px;color:var(--text-3)">Music discovery and metadata are provided by the official YouTube Data API v3. SangeetPremi does not host, download or redistribute any audio — it organizes links to content on YouTube.</p>
    </section>
    <section class="clay" style="padding:26px 30px;margin-top:22px">
      <h3 style="margin-bottom:12px">Open source</h3>
      <p style="font-size:13.5px">Licensed under the GNU General Public License v3.0. Source code: <a href="https://github.com/SPOOKEYfr/sangeetpremi" target="_blank" rel="noopener">github.com/SPOOKEYfr/sangeetpremi</a></p>
    </section>
  </div>`;
}
