/** About page — credits SPOOKEYfr as creator/developer. */
import { logoSvg } from '../../components/logo';
import { icon } from '../../components/icons';

export function renderAbout(el: HTMLElement): void {
  el.innerHTML = `
  <div class="fade-in" style="max-width:720px;display:flex;flex-direction:column;gap:22px">
    <section class="clay" style="padding:38px 40px;text-align:center">
      <div style="display:flex;justify-content:center;margin-bottom:18px">${logoSvg(84)}</div>
      <h1 style="font-size:34px">Sangeet<span style="color:var(--accent-violet)">Premi</span></h1>
      <p style="margin:12px auto 6px;max-width:480px;font-size:15px;color:var(--text-1)">Search an artist. Discover their music. Enjoy everything in one place.</p>
      <p style="color:var(--text-3);font-size:13px;margin:0 0 16px">Version 0.1.0 · Browser extension (Manifest V3)</p>
      <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap">
        <span class="badge">Manifest V3</span>
        <span class="badge teal">TypeScript Strict</span>
        <span class="badge warm">GPL-3.0 License</span>
        <span class="badge muted">Zero Telemetry</span>
        <span class="badge muted">100% On-Device</span>
      </div>
    </section>

    <section class="clay" style="padding:26px 30px">
      <h3 style="margin-bottom:12px">Credits &amp; Leadership</h3>
      <p style="margin:0 0 10px"><strong style="color:var(--text-1);font-size:15px">Created and developed by SPOOKEYfr</strong></p>
      <p style="font-size:13px;color:var(--text-2);margin:0;line-height:1.6">Canonical discography and recording metadata are retrieved from MusicBrainz and Cover Art Archive under open community standards. SangeetPremi organizes canonical artist recordings, releases, and discographies, with optional playback links to YouTube. SangeetPremi does not host, scrape, download or redistribute any audio files.</p>
    </section>

    <section class="clay" style="padding:26px 30px">
      <h3 style="margin-bottom:12px">Open Source Project</h3>
      <p style="font-size:13.5px;margin:0 0 16px">Licensed under the <strong>GNU General Public License v3.0 (GPL-3.0)</strong>. Contributions, bug reports, and feedback are welcomed on GitHub.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn-ghost btn-sm" href="https://github.com/SPOOKEYfr/sangeetpremi" target="_blank" rel="noopener">${icon('external', 14)} GitHub Repository</a>
        <a class="btn btn-ghost btn-sm" href="https://github.com/SPOOKEYfr/sangeetpremi/issues" target="_blank" rel="noopener">${icon('alert', 14)} Issue Tracker</a>
        <a class="btn btn-ghost btn-sm" href="https://github.com/SPOOKEYfr/sangeetpremi/blob/main/SECURITY.md" target="_blank" rel="noopener">${icon('shield', 14)} Security Policy</a>
      </div>
    </section>
  </div>`;
}
