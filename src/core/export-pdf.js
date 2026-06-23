/**
 * Export PDF nello STESSO formato delle slide (decisione: locale, zero dipendenze).
 * Niente Puppeteer/weasyprint: si usa il motore di stampa del browser.
 *
 * Ogni slide diventa una pagina 16:9 esatta:
 *   1280px @96dpi = 13.333in = 338.667mm  ·  720px = 7.5in = 190.5mm
 * via `@page { size: 338.667mm 190.5mm; margin:0 }` + un blocco 1280×720 per slide.
 * L'utente sceglie "Salva come PDF" → pagine identiche alle slide.
 *
 * Sfondo: i deck mettono spesso il fondale su `body` (e le slide hanno layer
 * semi-trasparenti sopra). Impilando le slide in un unico documento, ogni pagina
 * cadrebbe su una fetta diversa del gradiente del body → fondale incoerente
 * (si scurisce di pagina in pagina). Per questo replichiamo lo sfondo del body
 * SU OGNI pagina (computato da un render off-screen) e azzeriamo quello del body.
 *
 * Suggerire all'utente di attivare "Grafica di sfondo" nel dialogo di stampa.
 */

import { cleanSlideHtml, CREDIT } from './export-html.js';
import { CANVAS } from './model.js';

// [F1] canvas PER-DECK: la pagina @page è in mm = px/96·25.4 (1:1 col canvas → identico,
// indipendente dalla misura 16:9; per 1280×720 = 338.667×190.5mm come prima).
const mm = (px) => (px * 25.4 / 96).toFixed(3);
const printCssBase = (cw, ch) => `
@page { size: ${mm(cw)}mm ${mm(ch)}mm; margin: 0; }
html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.ss-page{position:relative;width:${cw}px;height:${ch}px;overflow:hidden;
  page-break-after:always;break-after:page;}
.ss-page:last-child{page-break-after:auto;break-after:auto;}
/* Forza ogni slide visibile e ferma nella sua pagina (override della logica .active) */
.ss-page > .slide{position:absolute !important;inset:0 !important;
  opacity:1 !important;visibility:visible !important;transform:none !important;
  transition:none !important;pointer-events:auto !important;}`;

export function buildPrintHtml(deck, { pageBackground = '' } = {}) {
  if ((deck.mode || 'deck') === 'doc') return buildDocPrintHtml(deck);
  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h; // [F1] canvas per-deck
  const pages = deck.slides
    .map((s) => {
      // 'active' su OGNI pagina: i deck che mostrano/nascondono con .slide{display:none}
      // + .slide.active{display:flex} altrimenti stamperebbero pagine vuote (qui ogni
      // pagina è una slide a sé, tutte vanno rese visibili). Innocuo per i deck a opacità.
      const cls = ['slide', 'active', ...(s.classes || [])].filter(Boolean).join(' ');
      const id = s.elId ? ` id="${s.elId}"` : ''; // preserva l'id (CSS #slide-N del deck)
      return `<div class="ss-page"><section${id} class="${cls}">${cleanSlideHtml(s.html)}</section></div>`;
    })
    .join('\n');

  // Quando abbiamo lo sfondo del body: lo applichiamo a ogni pagina e azzeriamo
  // quello del body (altrimenti si "stira" su tutto il documento e scurisce).
  const bgCss = pageBackground
    ? `html,body{background:none !important;}\n.ss-page{${pageBackground}}`
    : '';

  return `<!DOCTYPE html>${CREDIT}<html lang="${deck.meta?.lang || 'it'}"><head>
<meta charset="UTF-8" /><title>${(deck.meta?.title || 'Deck')} — PDF</title>
<style>${deck.styleCss || ''}</style>
<style>${printCssBase(cw, ch)}\n${bgCss}</style>
</head><body>${pages}</body></html>`;
}

/** Stampa in modalità documento: pagine A4 con impaginazione naturale del browser. */
function buildDocPrintHtml(deck) {
  const content = cleanSlideHtml(deck.slides[0]?.html || '');
  return `<!DOCTYPE html>${CREDIT}<html lang="${deck.meta?.lang || 'it'}"><head>
<meta charset="UTF-8" /><title>${(deck.meta?.title || 'Documento')} — PDF</title>
<style>${deck.styleCss || ''}</style>
<style>@page{margin:16mm}html,body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style>
</head><body>${content}</body></html>`;
}

/**
 * Computa, da un render off-screen del solo stile del deck (alla dimensione di
 * UNA pagina), le dichiarazioni di sfondo del body — così possono essere
 * replicate identiche su ogni pagina. Stringa vuota se lo sfondo è trasparente.
 */
export function computeBodyBackground(styleCss, canvas = CANVAS) {
  return new Promise((resolve) => {
    const f = document.createElement('iframe');
    Object.assign(f.style, {
      position: 'fixed', left: '-99999px', top: '0',
      width: `${canvas.w || CANVAS.w}px`, height: `${canvas.h || CANVAS.h}px`, border: '0', visibility: 'hidden',
    });
    document.body.append(f);
    const d = f.contentDocument;
    d.open();
    d.write(`<!DOCTYPE html><html><head><style>${styleCss || ''}</style></head><body></body></html>`);
    d.close();

    const finish = () => {
      let decl = '';
      try {
        const win = f.contentWindow;
        const pick = (node) => {
          const cs = win.getComputedStyle(node);
          const transparent = cs.backgroundImage === 'none' &&
            (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent');
          if (transparent) return '';
          return `background-color:${cs.backgroundColor};background-image:${cs.backgroundImage};` +
            `background-position:${cs.backgroundPosition};background-size:${cs.backgroundSize};` +
            `background-repeat:${cs.backgroundRepeat};`;
        };
        decl = pick(d.body) || pick(d.documentElement);
      } catch (_) { decl = ''; }
      f.remove();
      resolve(decl);
    };

    if (d.readyState === 'complete') setTimeout(finish, 30);
    else f.addEventListener('load', () => setTimeout(finish, 30), { once: true });
  });
}

/**
 * Apre un iframe nascosto col documento di stampa e lancia il dialogo.
 * Ritorna una Promise che si risolve dopo l'avvio della stampa.
 */
export async function exportPdf(deck) {
  const isDoc = (deck.mode || 'deck') === 'doc';
  const pageBackground = isDoc ? '' : await computeBodyBackground(deck.styleCss, deck.canvas || CANVAS);
  const html = buildPrintHtml(deck, { pageBackground });

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, {
      position: 'fixed', right: '0', bottom: '0',
      width: '0', height: '0', border: '0', visibility: 'hidden',
    });
    document.body.append(iframe);

    const doc = iframe.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();

    // Pulizia SOLO dopo che la stampa è conclusa/annullata. Rimuovere l'iframe a timer
    // fisso (mentre il dialogo "Salva come PDF" è ancora aperto) lascia su Windows il
    // file di output bloccato → "impossibile aprire: aperto da un'altra app". Su Chrome
    // moderno print() ritorna subito (il dialogo resta aperto), quindi aspettiamo
    // l'evento afterprint; fallback generoso se non scatta.
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; iframe.remove(); resolve(); };
    const fire = () => {
      const w = iframe.contentWindow;
      w.addEventListener('afterprint', () => setTimeout(cleanup, 300), { once: true });
      setTimeout(cleanup, 120000); // fallback: alcuni browser non emettono afterprint
      try {
        w.focus();
        w.print();
      } catch (_) {
        setTimeout(cleanup, 800);
      }
    };
    if (iframe.contentWindow.document.readyState === 'complete') setTimeout(fire, 150);
    else iframe.addEventListener('load', () => setTimeout(fire, 150), { once: true });
  });
}
