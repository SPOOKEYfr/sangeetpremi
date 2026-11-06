import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.ts';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
  },
  server: {
    // Dev server used for the dashboard during development; the extension
    // itself is loaded from dist/ via `npm run build` + chrome://extensions.
    port: 5173,
    strictPort: true,
  },
});
