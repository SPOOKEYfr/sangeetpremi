/**
 * Prebuild: sync the repository's draft PRIVACY.md / TERMS.md into
 * website/content so the legal pages render the ACTUAL draft text.
 *
 * When the website is extracted standalone (e.g. from the transferable
 * archive, without the surrounding repo), the repo-root files are absent;
 * in that case the bundled content/ copies are kept as-is. Source files
 * are never modified.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const outDir = resolve(here, '..', 'content');
mkdirSync(outDir, { recursive: true });
for (const name of ['PRIVACY.md', 'TERMS.md']) {
  const src = resolve(repoRoot, name);
  if (existsSync(src)) {
    copyFileSync(src, resolve(outDir, name));
    console.log(`synced ${name} (draft) from repo root -> website/content/${name}`);
  } else {
    console.log(`repo root ${name} not present (standalone build); keeping bundled website/content/${name}`);
  }
}
