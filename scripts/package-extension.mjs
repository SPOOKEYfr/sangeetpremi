/**
 * Packages dist/ into a versioned .zip ready for the Chrome Web Store
 * (or sideloading). Usage: npm run package
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const dist = 'dist';
if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json not found — run `npm run build` first.');
  process.exit(1);
}
const pkg = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile('package.json', 'utf8')));
const out = `sangeetpremi-${pkg.version}.zip`;
execFileSync('zip', ['-qr', out, '.'], { cwd: dist });
const size = statSync(out).size;
console.log(`Packaged ${out} (${(size / 1024).toFixed(1)} kB) from dist/ with ${readdirSync(dist).length} top-level entries.`);
