// Genera src/vendor/snapdom-src.js: la sorgente UMD di snapdom inglobata come
// stringa ES, così può essere iniettata in un <script> dentro l'iframe di stampa
// (snapdom va eseguito nel documento dove vivono gli elementi → vh/vw risolti).
// Caricata dinamicamente solo all'export raster: i test core non la toccano.
//
// Rigenerare dopo un update di @zumer/snapdom:  node tools/gen-snapdom-src.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ver = JSON.parse(readFileSync('node_modules/@zumer/snapdom/package.json', 'utf8')).version;
let src = readFileSync('node_modules/@zumer/snapdom/dist/snapdom.js', 'utf8');
// sicurezza iniezione in <script>: spezza eventuali </script> nel sorgente
src = src.replace(/<\/script>/gi, '<\\/script>');

const out =
  `// AUTO-GENERATO da tools/gen-snapdom-src.mjs — NON modificare a mano.\n` +
  `// snapdom v${ver} (MIT) — sorgente UMD inglobata come stringa per iniezione nell'iframe di stampa.\n` +
  `export const SNAPDOM_VERSION = ${JSON.stringify(ver)};\n` +
  `export const SNAPDOM_SRC = ${JSON.stringify(src)};\n`;

mkdirSync('src/vendor', { recursive: true });
writeFileSync('src/vendor/snapdom-src.js', out);
console.log(`scritto src/vendor/snapdom-src.js — ${out.length} bytes | snapdom v${ver}`);
