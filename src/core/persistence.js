/**
 * Salvataggio diretto sul file .html via File System Access API (nativa nei
 * browser Chromium — zero dipendenze). Permette "Apri" mantenendo un handle al
 * file e "Salva"/autosave che riscrivono lo stesso file (com'è un'app desktop).
 *
 * Fallback automatico (Firefox/Safari o contesti non sicuri): <input type=file>
 * per aprire e download per salvare (vedi app.js).
 */

export const fsSupported =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;

const HTML_TYPES = [{ description: 'Deck HTML', accept: { 'text/html': ['.html', '.htm'] } }];

export async function openDeckFile() {
  const [handle] = await window.showOpenFilePicker({ types: HTML_TYPES, multiple: false });
  const file = await handle.getFile();
  return { handle, text: await file.text(), name: file.name };
}

export async function pickSaveFile(suggestedName) {
  return window.showSaveFilePicker({ suggestedName, types: HTML_TYPES });
}

export async function writeHandle(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Verifica/richiede il permesso readwrite sull'handle (necessario dopo reload). */
export async function ensureWritable(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}
