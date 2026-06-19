/**
 * Pool di asset (immagini base64) fuori dal modello/history.
 *
 * Problema: con immagini inline in base64, ogni snapshot di undo duplicherebbe
 * i MB. Soluzione: il modello tiene un PLACEHOLDER leggero
 * (`<img src="" data-ss-asset="a3">`); i dataURL vivono qui, in un registry
 * module-level NON clonato dalla history. Si "inlina" solo al render e all'export.
 */

export const ASSET_ATTR = 'data-ss-asset';

const registry = new Map(); // id -> dataURL
let _n = 0;

export function putAsset(dataURL) {
  const id = `a${++_n}`;
  registry.set(id, dataURL);
  return id;
}
export function getAsset(id) {
  return registry.get(id) || '';
}

/**
 * Sostituisce le immagini base64 con placeholder (src vuoto + id asset),
 * spostando i dataURL nel registry. Riusa l'id esistente se già presente
 * (così re-commit ripetuti NON gonfiano il registry).
 * @returns html alleggerito (forma "modello").
 */
export function externalize(html) {
  if (!html || html.indexOf('data:') === -1 && html.indexOf(ASSET_ATTR) === -1) return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('data:')) {
      const id = img.getAttribute(ASSET_ATTR) || putAsset(src);
      registry.set(id, src);
      img.setAttribute(ASSET_ATTR, id);
      img.setAttribute('src', '');
    }
  });
  return tpl.innerHTML;
}

/**
 * Reinserisce i dataURL al posto dei placeholder.
 * @param forExport se true rimuove l'attributo asset (HTML pulito).
 */
export function inline(html, { forExport = false } = {}) {
  if (!html || html.indexOf(ASSET_ATTR) === -1) return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll(`img[${ASSET_ATTR}]`).forEach((img) => {
    const id = img.getAttribute(ASSET_ATTR);
    const data = getAsset(id);
    if (data) img.setAttribute('src', data);
    if (forExport) img.removeAttribute(ASSET_ATTR);
  });
  return tpl.innerHTML;
}
