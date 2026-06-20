import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Build a piu' uscite (pattern riusato da hex-tactics):
 *  - `npm run build`        → output multi-file in dist/ (guscio web, debug/dev).
 *  - `npm run build:single` → SINGLEFILE=1 → dist/index.html standalone (doppio-click).
 *  - `npm run build:vscode` → TARGET=vscode → bundle della webview in extension/media/
 *    (entry apps/vscode/index.html → guscio VS Code). Path relativi (base './') così
 *    l'extension host puo' riscriverli in URI webview.
 */
const SINGLE_FILE = process.env.SINGLEFILE === '1';
const VSCODE = process.env.TARGET === 'vscode';

export default defineConfig(
  VSCODE
    ? {
        root: 'apps/vscode',
        base: './',
        build: {
          target: 'es2022',
          outDir: resolve(__dirname, 'extension/media'),
          emptyOutDir: true,
          assetsInlineLimit: 4096,
        },
      }
    : {
        plugins: SINGLE_FILE ? [viteSingleFile()] : [],
        server: { host: true, port: 5173, open: false },
        build: {
          target: 'es2022',
          sourcemap: !SINGLE_FILE,
          assetsInlineLimit: SINGLE_FILE ? 100_000_000 : 4096,
        },
      },
);
