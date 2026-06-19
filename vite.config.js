import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Build a doppia uscita (pattern riusato da hex-tactics):
 *  - `npm run build`        → output multi-file in dist/ (debug + dev).
 *  - `npm run build:single` → SINGLEFILE=1 → dist/index.html standalone con
 *    tutto inlined (JS+CSS). È l'editor "doppio-click, zero server" (Opzione A).
 */
const SINGLE_FILE = process.env.SINGLEFILE === '1';

export default defineConfig({
  plugins: SINGLE_FILE ? [viteSingleFile()] : [],
  server: {
    host: true,
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: !SINGLE_FILE,
    assetsInlineLimit: SINGLE_FILE ? 100_000_000 : 4096,
  },
});
