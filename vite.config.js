import { defineConfig } from 'vite';

// Relative base keeps the build portable: local preview, GitHub Pages project
// sites, or any static host under a subpath.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
});
