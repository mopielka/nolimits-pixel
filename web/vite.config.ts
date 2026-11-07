import { defineConfig } from 'vite';

export default defineConfig({
  // Packages live next to the app, in ../animations and ../examples.
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist-web', emptyOutDir: true },
});
