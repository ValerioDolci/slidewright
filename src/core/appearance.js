/**
 * Snapshot dell'aspetto computato di un elemento (per copia/incolla fedele).
 *
 * Quando si incolla un oggetto, l'App lo riattacca come figlio della root della
 * slide: gli stili che dipendono dall'ANTENATO (selettori discendenti) o dallo
 * SCOPING PER-ID del deck (`#slide-3 .card { color: … }`, comune nei deck reali)
 * non matchano piu' nella nuova posizione e il formato va perso. Inlinando
 * l'aspetto COMPUTATO (mentre l'elemento e' ancora nel suo contesto originale)
 * l'oggetto incollato resta fedele ovunque finisca — anche in un'altra slide o
 * in un altro deck.
 *
 * Volutamente NON include geometria/layout (position/left/top/width/height/
 * margin/display): la posizione la gestisce gia' l'incolla (offset), e congelare
 * il layout darebbe sorprese. Solo tipografia + decorazione del box.
 */
export const APPEARANCE_PROPS = [
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'text-align', 'text-transform',
  'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
  'text-shadow', 'white-space',
  'background-color', 'background-image', 'background-size', 'background-position',
  'background-repeat', 'background-clip',
  'border-top-width', 'border-top-style', 'border-top-color',
  'border-right-width', 'border-right-style', 'border-right-color',
  'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
  'border-left-width', 'border-left-style', 'border-left-color',
  'border-radius', 'box-shadow', 'opacity',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
];

// valori "neutri" da NON inlinare (rumore inutile che gonfia l'HTML)
function isNoise(prop, v) {
  if (!v) return true;
  if (v === 'none' || v === 'normal' || v === 'auto') return true;
  if (prop === 'background-color' && v === 'rgba(0, 0, 0, 0)') return true;
  if (prop.startsWith('border-') && prop.endsWith('-width') && v === '0px') return true;
  if (prop.startsWith('padding-') && v === '0px') return true;
  if (prop === 'opacity' && v === '1') return true;
  if (prop === 'letter-spacing' && v === '0px') return true;
  if (prop === 'border-radius' && v === '0px') return true;
  if (prop === 'font-weight' && v === '400') return true;
  // background-image con url() ESTERNO: getComputedStyle lo risolve in path
  // assoluto (es. file:///… aprendo da disco) → l'oggetto incollato porterebbe
  // un riferimento fragile che si rompe spostando/condividendo il deck.
  // I gradient e i data:URI (auto-portanti) restano.
  if (prop === 'background-image' && v.includes('url(') && !v.includes('data:')) return true;
  return false;
}

/**
 * Legge l'aspetto computato di UN elemento come mappa { prop: valore },
 * scartando i valori neutri/di default. Usato sia dallo snapshot (copia/incolla
 * oggetto) sia dal "copia formato" (applica lo stile a un altro elemento).
 * @param {Element} el
 * @param {Window} win
 * @returns {Object<string,string>}
 */
export function readAppearance(el, win) {
  const cs = win.getComputedStyle(el);
  const out = {};
  for (const p of APPEARANCE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (!isNoise(p, v)) out[p] = v;
  }
  return out;
}

/**
 * Clona `srcEl` e inlina sul clone l'aspetto computato di ogni nodo.
 * Lo stile inline preesistente (geometria: left/top/width…) viene PRESERVATO:
 * uso `style.setProperty` sul clone, così la CSSOM sovrascrive solo le proprietà
 * d'aspetto (color/font/ecc.) senza duplicarle e gestendo da sola escaping/
 * separatori dei valori (data-URI, gradient, font-family con virgole).
 * @param {Element} srcEl  elemento vivo nel suo contesto originale
 * @param {Window} win     finestra del documento di `srcEl` (per getComputedStyle)
 * @returns {Element} clone con l'aspetto inlineato
 */
export function snapshotAppearance(srcEl, win) {
  const clone = srcEl.cloneNode(true);
  const srcNodes = [srcEl, ...srcEl.querySelectorAll('*')];
  const dstNodes = [clone, ...clone.querySelectorAll('*')];
  const n = Math.min(srcNodes.length, dstNodes.length);
  for (let i = 0; i < n; i++) {
    const style = dstNodes[i].style;
    for (const [p, v] of Object.entries(readAppearance(srcNodes[i], win))) {
      style.setProperty(p, v);
    }
  }
  return clone;
}
