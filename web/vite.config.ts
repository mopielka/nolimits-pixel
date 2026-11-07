import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs so the built site works under any path, e.g. GitHub Pages' /<repo>/.
  base: './',
  // Packages live next to the app, in ../animations and ../examples.
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist-web', emptyOutDir: true },
});
