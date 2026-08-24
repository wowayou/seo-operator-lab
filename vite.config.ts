import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // The upstream Playground client is one lazy module (~501 kB minified, ~124 kB gzip).
    chunkSizeWarningLimit: 520,
  },
});
