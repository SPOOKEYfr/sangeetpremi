/**
 * Packages dist/ into a versioned .zip at the REPOSITORY ROOT (never inside
 * dist/, so the archive can never include itself).
 * Usage: npm run package   (run `npm run build` first)
 */
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const dist = resolve('dist');
const out = resolve(`sangeetpremi-${JSON.parse(await readFile('package.json', 'utf8')).version}.zip`);

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json not found — run `npm run build` first.');
  process.exit(1);
}
// Remove a stale archive first so it can never be self-included.
if (existsSync(out)) execFileSync('rm', ['-f', out]);
execFileSync('zip', ['-qr', out, '.', '-x', '*.zip'], { cwd: dist });

const size = statSync(out).size; // stat the real output path
const listing = execFileSync('unzip', ['-l', out], { encoding: 'utf8' });
const entries = listing.split('\n').filter((l) => l.includes('dist') || /\.(json|html|js|css|png)$/.test(l));
const entryLines = listing.split('\n').filter((l) => /^\s*\d+\s+\d{4}-/.test(l)); // actual archive entries only
const hasManifest = entryLines.some((l) => l.endsWith('manifest.json'));
const selfIncluded = entryLines.some((l) => l.endsWith('.zip')); // header line "Archive: ...zip" excluded
const manifestVersion = JSON.parse(execFileSync('unzip', ['-p', out, 'manifest.json'], { encoding: 'utf8' })).version;
const pkgVersion = JSON.parse(await readFile('package.json', 'utf8')).version;

console.log(`Packaged ${out.split('/').pop()} (${(size / 1024).toFixed(1)} kB, ${entries.length} files)`);
console.log(`manifest.json inside archive: ${hasManifest}, version: ${manifestVersion} (package.json: ${pkgVersion})`);
if (!hasManifest || selfIncluded || manifestVersion !== pkgVersion) {
  console.error('Packaging verification FAILED');
  process.exit(1);
}
console.log('Packaging verification OK: archive exists, manifest present, no self-inclusion, versions match.');
