import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Multi-page static site. Cloudflare Pages: root directory = /website,
// build command = npm run build, output directory = dist.
export default defineConfig({
  base: './',
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: r('index.html'),
        features: r('features.html'),
        download: r('download.html'),
        about: r('about.html'),
        privacy: r('privacy.html'),
        terms: r('terms.html'),
        404: r('404.html'),
      },
    },
  },
});
