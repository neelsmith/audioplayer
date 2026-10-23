import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { singleFile } from './build/singleFile.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  root: 'src',
  plugins: [singleFile({ fileName: 'audioplayer.html' })],
  // Version from package.json, baked in at build time (see src/version.js).
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.js'],
    environment: 'jsdom',
  },
});
