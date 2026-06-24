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

import { cleanSlideHtml, CREDIT, buildInnerDeckDoc, escapeSrcdoc } from './export-html.js';
import { CANVAS } from './model.js';

// [F1] canvas PER-DECK: la pagina @page è in mm = px/96·25.4 (1:1 col canvas → identico,
// indipendente dalla misura 16:9; per 1280×720 = 338.667×190.5mm come prima).
const mm = (px) => (px * 25.4 / 96).toFixed(3);

// Shell ESTERNA del documento di stampa: una pagina @page per slide, ognuna che contiene un
// iframe a misura-canvas (vedi buildPrintHtml). print-color-adjust:exact forza la stampa di
// sfondi/gradienti (Chrome altrimenti li scarta → box semitrasparenti su bianco).
const printShellCss = (cw, ch) => `
@page { size: ${mm(cw)}mm ${mm(ch)}mm; margin: 0; }
*,*::before,*::after{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
html,body{margin:0;padding:0;}
.ss-page{position:relative;width:${cw}px;height:${ch}px;overflow:hidden;
  page-break-after:always;break-after:page;}
.ss-page:last-child{page-break-after:auto;break-after:auto;}
.ss-print-fr{width:${cw}px;height:${ch}px;border:0;display:block;}`;

export function buildPrintHtml(deck) {
  if ((deck.mode || 'deck') === 'doc') return buildDocPrintHtml(deck);
  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h; // [F1] canvas per-deck

  // [PDF = editor, per costruzione] Ogni pagina è un iframe a misura-canvas che contiene UNA
  // sola slide, costruito con lo STESSO motore della presentazione (buildInnerDeckDoc: innerCss
  // forza la slide al canvas + innerJs fa l'auto-fit F4). L'iframe crea il proprio viewport
  // ${cw}×${ch} → le `@media`/`vw`/`vh` del deck si risolvono come in editor/presentazione, NON
  // sul viewport di stampa (che è stretto → faceva collassare i layout responsive e scalare le
  // slide in modo diverso = "slide di dimensioni diverse" nel PDF). @page dà la carta = canvas.
  // print-color-adjust:exact va messo DENTRO l'iframe (documento a sé): forza la stampa di
  // sfondi/gradienti dei box anche senza spuntare "Grafica di sfondo" nel dialogo. La regola
  // sulla shell esterna NON raggiunge il contenuto dell'iframe → senza questa i box perdono il
  // riempimento e appaiono bianchi nel PDF.
  const COLOR_EXACT = '<style>*,*::before,*::after{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}</style>';
  const pages = deck.slides
    .map((s) => {
      const inner = buildInnerDeckDoc({ ...deck, slides: [s] }).replace('</head>', `${COLOR_EXACT}</head>`);
      const srcdoc = escapeSrcdoc(inner);
      return `<div class="ss-page"><iframe class="ss-print-fr" srcdoc="${srcdoc}"></iframe></div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>${CREDIT}<html lang="${deck.meta?.lang || 'it'}"><head>
<meta charset="UTF-8" /><title>${(deck.meta?.title || 'Deck')} — PDF</title>
<style>${printShellCss(cw, ch)}</style>
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
  const html = buildPrintHtml(deck);
  // Niente più computeBodyBackground per i deck: ogni pagina è un iframe che porta dentro lo
  // sfondo del body del deck (render corretto per-slide), quindi non c'è lo "stiramento" del
  // fondale su un documento alto N×canvas che la replica per-pagina compensava.

  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h;

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, {
      position: 'fixed', left: '-99999px', top: '0',
      width: `${cw}px`, height: `${ch}px`, border: '0', visibility: 'hidden',
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
      // Aspetta che TUTTI gli iframe-pagina annidati (srcdoc) abbiano caricato il loro
      // contenuto PRIMA di stampare: print() prematura stamperebbe pagine vuote. Gli srcdoc
      // sono inline (niente rete) → caricano subito, ma attendiamo i load per sicurezza.
      const inner = [].slice.call(iframe.contentDocument.querySelectorAll('iframe.ss-print-fr'));
      Promise.all(inner.map((fr) => new Promise((res) => {
        try { if (fr.contentDocument && fr.contentDocument.readyState === 'complete') return res(); } catch (_) { /* same-origin srcdoc */ }
        fr.addEventListener('load', () => res(), { once: true });
        setTimeout(res, 4000); // fallback per-iframe
      }))).then(() => {
        // due rAF: lascia assestare layout + auto-fit dentro gli iframe prima dello snapshot
        w.requestAnimationFrame(() => w.requestAnimationFrame(() => {
          w.addEventListener('afterprint', () => setTimeout(cleanup, 300), { once: true });
          setTimeout(cleanup, 120000); // fallback: alcuni browser non emettono afterprint
          try {
            w.focus();
            w.print();
          } catch (_) {
            setTimeout(cleanup, 800);
          }
        }));
      });
    };
    if (iframe.contentWindow.document.readyState === 'complete') setTimeout(fire, 150);
    else iframe.addEventListener('load', () => setTimeout(fire, 150), { once: true });
  });
}
