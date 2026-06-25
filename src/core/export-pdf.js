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
 * Come computeBodyBackground ma ritorna ANCHE le proprietà EREDITABILI del body (color, font…):
 * serve quando si rende una slide in un <div> senza iframe — lì il body del deck non esiste, e
 * senza queste il testo eredita gli stili dell'editor (es. colore scuro → invisibile).
 */
export function computeBodyInheritedStyle(styleCss, canvas = CANVAS) {
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
        const cs = f.contentWindow.getComputedStyle(d.body);
        const bgTransparent = cs.backgroundImage === 'none' &&
          (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent');
        if (!bgTransparent) {
          decl += `background-color:${cs.backgroundColor};background-image:${cs.backgroundImage};` +
            `background-position:${cs.backgroundPosition};background-size:${cs.backgroundSize};background-repeat:${cs.backgroundRepeat};`;
        }
        decl += `color:${cs.color};font-family:${cs.fontFamily};font-size:${cs.fontSize};` +
          `font-weight:${cs.fontWeight};line-height:${cs.lineHeight};letter-spacing:${cs.letterSpacing};text-align:${cs.textAlign};`;
      } catch (_) { decl = ''; }
      f.remove();
      resolve(decl);
    };
    if (d.readyState === 'complete') setTimeout(finish, 30);
    else f.addEventListener('load', () => setTimeout(finish, 30), { once: true });
  });
}

// ============================ EXPORT PDF RASTERIZZATO ============================
// Alcuni deck usano molte trasparenze (rgba, gradienti, opacity, backdrop-filter): il PDF
// VETTORIALE risultante contiene transparency-group + soft-mask che i vari motori PDF NON
// compongono allo stesso modo. Adobe/Chrome (desktop) li rendono bene; PDFium (molti viewer
// MOBILE) sbaglia la composizione → "patina" bianca/blu o box che diventano opachi. Lo stesso
// identico file si vede quindi diverso su device diversi.
//
// Rimedio robusto: rasterizzare ogni slide in un'IMMAGINE (ad alta risoluzione) e impaginare
// le immagini → il PDF non ha più trasparenze da comporre → IDENTICO su ogni device/viewer.
// La rasterizzazione è 100% in-browser (gira anche dal single-file su file://): si usa snapdom
// (vendored come stringa, iniettata e ESEGUITA DENTRO l'iframe a misura-canvas così le unità
// vh/vw e le catene di altezze risolvono come nell'editor/presentazione). Costo: testo non
// selezionabile e file più pesante; per i deck "carichi" è l'unica via alla fedeltà cross-device.

const RASTER_SCALE = 2; // moltiplicatore di risoluzione (2× = nitido in stampa)

/** Rasterizza UNA slide in un dataURL PNG. snapdom gira dentro l'iframe (viewport = canvas). */
function rasterizeSlide(innerHtml, snapdomSrc, cw, ch, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, {
      position: 'fixed', left: '-99999px', top: '0',
      width: `${cw}px`, height: `${ch}px`, border: '0', visibility: 'hidden',
    });
    // Inietto snapdom + uno script di cattura PRIMA di </body>: snapdom va eseguito nel
    // documento dove vivono gli elementi (stesso contesto), non dal parent (document errato).
    const capture =
      `<script>${snapdomSrc}<\/script>` +
      `<script>window.addEventListener('load',function(){setTimeout(async function(){try{` +
      `var r=await window.snapdom(document.body,{scale:${RASTER_SCALE},dpr:1,fast:false});` +
      `var c=await r.toCanvas();` +
      `parent.postMessage({__ssRaster:c.toDataURL('image/png')},'*');` +
      `}catch(e){parent.postMessage({__ssRasterErr:String(e&&e.message||e)},'*');}},80);});<\/script>`;
    const doc = innerHtml.includes('</body>')
      ? innerHtml.replace('</body>', `${capture}</body>`)
      : innerHtml + capture;

    let done = false;
    const cleanup = () => { if (done) return; done = true; window.removeEventListener('message', onMsg); iframe.remove(); };
    const onMsg = (e) => {
      if (e.source !== iframe.contentWindow || !e.data) return;
      if (e.data.__ssRaster) { const u = e.data.__ssRaster; cleanup(); resolve(u); }
      else if (e.data.__ssRasterErr) { const m = e.data.__ssRasterErr; cleanup(); reject(new Error(m)); }
    };
    window.addEventListener('message', onMsg);
    setTimeout(() => { if (!done) { cleanup(); reject(new Error('raster timeout')); } }, timeoutMs);

    // doc.write (iframe SENZA src) → eredita l'origine del parent (file:// o http): same-origin,
    // così snapdom può fare canvas.toDataURL (con `srcdoc` l'origine è opaca/null → canvas TAINTED
    // → toDataURL lancia SecurityError e il raster non parte da file://). Stesso motivo per cui
    // il print vettoriale usa doc.write.
    document.body.append(iframe);
    const d = iframe.contentDocument;
    d.open(); d.write(doc); d.close();
  });
}

/** Rasterizza tutte le slide del deck → array di dataURL PNG (in ordine). */
export async function rasterizeDeck(deck) {
  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h;
  // snapdom caricato DINAMICAMENTE: i test core (che importano buildPrintHtml) non lo toccano,
  // e il vettoriale resta utilizzabile anche se il vendor non c'è.
  const { SNAPDOM_SRC } = await import('../vendor/snapdom-src.js');
  const images = [];
  for (const s of deck.slides) {
    const inner = buildInnerDeckDoc({ ...deck, slides: [s] });
    images.push(await rasterizeSlide(inner, SNAPDOM_SRC, cw, ch)); // sequenziale: meno memoria
  }
  return images;
}

/** Documento di stampa rasterizzato: 1 pagina @page per immagine (niente trasparenze). */
export function buildRasterPrintHtml(deck, images) {
  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h;
  const pages = images
    .map((src) => `<div class="ss-page"><img class="ss-raster" src="${src}" alt="" /></div>`)
    .join('\n');
  return `<!DOCTYPE html>${CREDIT}<html lang="${deck.meta?.lang || 'it'}"><head>
<meta charset="UTF-8" /><title>${(deck.meta?.title || 'Deck')} — PDF</title>
<style>
@page { size: ${mm(cw)}mm ${mm(ch)}mm; margin: 0; }
html,body{margin:0;padding:0;}
.ss-page{width:${cw}px;height:${ch}px;overflow:hidden;page-break-after:always;break-after:page;}
.ss-page:last-child{page-break-after:auto;break-after:auto;}
.ss-raster{width:${cw}px;height:${ch}px;display:block;}
</style></head><body>${pages}</body></html>`;
}

// ============================ EXPORT PDF "CATTURA SCHERMO" ============================
// Screenshot del RENDER REALE del browser via Screen Capture API: fedele al 100% e senza
// trasparenze nel PDF → identico su ogni viewer/device (aggira il bug Skia del PDF vettoriale).
// Le slide sono rese in un <div> con Shadow DOM (NON un iframe): l'Element Capture (restrictTo)
// emette frame su un div ma non su un iframe, cattura il CONTENUTO dell'elemento (niente cursore)
// e produce un frame a ogni render (non serve muovere il mouse). Fallback: Region Capture (cropTo).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Appiattisce le @media del CSS del deck rispetto al canvas FISSO cw×ch. Nel Shadow DOM le
 * @media si valuterebbero sul viewport reale (e `zoom` non le tocca) → deck responsive sbagliati.
 * Le condizioni width/height/orientation note sono valutate contro cw×ch: se vere, le regole
 * interne salgono a top-level; se false (incl. `print`) si scartano; quelle non interpretabili
 * restano com'erano (degrado al comportamento attuale, mai peggio).
 */
export function flattenMedia(css, cw, ch) {
  const evalCond = (cond) => {
    const c = String(cond).trim().toLowerCase();
    if (!c || c === 'all' || c === 'screen' || c === 'screen and') return true;
    if (/\bprint\b/.test(c)) return false;
    const feats = c.match(/\(([^)]+)\)/g);
    if (!feats) return null;
    let ok = true, parsed = false;
    for (const f of feats) {
      const [rawK, rawV = ''] = f.replace(/[()]/g, '').split(':');
      const key = rawK.trim(), val = rawV.trim(), px = parseFloat(val);
      if (key === 'min-width') { ok = ok && cw >= px; parsed = true; }
      else if (key === 'max-width') { ok = ok && cw <= px; parsed = true; }
      else if (key === 'min-height') { ok = ok && ch >= px; parsed = true; }
      else if (key === 'max-height') { ok = ok && ch <= px; parsed = true; }
      else if (key === 'orientation') { ok = ok && ((val === 'landscape') === (cw >= ch)); parsed = true; }
      else return null; // feature non gestita → non rischiare, lascia il blocco
    }
    return parsed ? ok : null;
  };
  let out = '', i = 0;
  while (i < css.length) {
    const at = css.indexOf('@media', i);
    if (at < 0) { out += css.slice(i); break; }
    out += css.slice(i, at);
    const open = css.indexOf('{', at);
    if (open < 0) { out += css.slice(at); break; }
    const cond = css.slice(at + 6, open);
    let depth = 1, j = open + 1;
    while (j < css.length && depth > 0) { const ch2 = css[j++]; if (ch2 === '{') depth++; else if (ch2 === '}') depth--; }
    const inner = css.slice(open + 1, j - 1);
    const res = evalCond(cond);
    if (res === true) out += inner;                 // condizione vera → regole a top-level
    else if (res === null) out += css.slice(at, j); // non interpretabile → lascia com'era
    // res === false → scarta il blocco
    i = j;
  }
  return out;
}

/** `:root` → `:host`, gestendo i selettori composti (`:root.dark` → `:host(.dark)`). */
function rootToHost(css) {
  return String(css).replace(/:root(\([^)]*\))?((?:[.:#[][^\s,{(]+)*)/g,
    (_, fn, rest) => (rest ? `:host(${rest})` : ':host' + (fn || '')));
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * Cattura ogni slide come immagine dal render REALE del browser (Screen Capture API).
 * Ritorna un array di dataURL PNG (in ordine). Mostra un overlay a piena pagina durante la cattura.
 * @param {object} deck @param {{onProgress?:(i:number,n:number)=>void}} [opts]
 */
export async function captureDeck(deck, opts = {}) {
  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h;
  const md = navigator.mediaDevices;
  if (!md || !md.getDisplayMedia) throw new Error('Cattura schermo non supportata da questo browser.');

  // vh/vw → px fissi (senza iframe si riferirebbero al viewport reale).
  const toPx = (css) => String(css || '').replace(/(-?\d*\.?\d+)(vw|vh|vmin|vmax)\b/g, (_, n, u) => {
    const f = { vw: cw / 100, vh: ch / 100, vmin: Math.min(cw, ch) / 100, vmax: Math.max(cw, ch) / 100 }[u];
    return `${(parseFloat(n) * f).toFixed(4)}px`;
  });

  // Tutto il setup (overlay, shadow, ecc.) DENTRO il try: se qualcosa lancia (attachShadow non
  // supportato, ecc.) il finally ripristina comunque cursore e rimuove l'overlay (niente lock).
  let stream, video, overlay;
  const prevCursor = document.documentElement.style.cursor;
  try {
    const styleCssPx = flattenMedia(toPx(deck.styleCss || ''), cw, ch);

    overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'none',
    });
    // target di restrictTo: idoneo all'Element Capture (stacking context + flat). NIENTE transform
    // né su di esso NÉ su un antenato (→ frame 1×1). Scaling con `zoom` (non crea contesto trasformato).
    const target = document.createElement('div');
    Object.assign(target.style, {
      width: `${cw}px`, height: `${ch}px`, overflow: 'hidden', position: 'relative',
      isolation: 'isolate', transformStyle: 'flat',
      zoom: String(Math.min(window.innerWidth / cw, window.innerHeight / ch)),
    });
    overlay.appendChild(target);
    document.body.appendChild(overlay);
    document.documentElement.style.cursor = 'none';

    // SHADOW DOM: isola il CSS del deck dall'editor (e viceversa).
    const shadow = target.attachShadow({ mode: 'open' });
    let bodyInherited = '';
    try { bodyInherited = await computeBodyInheritedStyle(styleCssPx, { w: cw, h: ch }); } catch (_) { /* noop */ }
    const styleEl = document.createElement('style');
    styleEl.textContent = `:host{display:block;width:${cw}px;height:${ch}px;overflow:hidden;background:#fff;${bodyInherited}}` +
      rootToHost(styleCssPx) + `
.ss-cap-deck{position:absolute !important;inset:0 !important;width:auto !important;height:auto !important;margin:0 !important;overflow:hidden}
.ss-cap-deck > .slide{position:absolute !important;left:0 !important;top:0 !important;right:auto !important;bottom:auto !important;margin:0 !important;width:${cw}px !important;height:${ch}px !important;transform:none !important;opacity:1 !important;visibility:visible !important}`;
    shadow.appendChild(styleEl);
    const deckEl = document.createElement('div');
    deckEl.className = 'deck ss-cap-deck';
    shadow.appendChild(deckEl);

    const renderSlide = async (i) => {
      const s = deck.slides[i];
      const cls = escAttr(['slide', ...(s.classes || []), 'active'].filter(Boolean).join(' '));
      const id = s.elId ? ` id="${escAttr(s.elId)}"` : '';
      deckEl.innerHTML = `<section${id} class="${cls}">${cleanSlideHtml(s.html)}</section>`;
      // Attendi la DECODE delle <img> (le base64 decodificano in ms; le rete hanno un cap): senza,
      // si catturerebbe la slide con immagini a metà. (I background-image data: non sono coperti qui.)
      const imgs = [].slice.call(deckEl.querySelectorAll('img'));
      await Promise.all(imgs.map((img) => (img.complete && img.naturalWidth)
        ? null : Promise.race([img.decode().catch(() => {}), sleep(2000)])));
    };
    const waitFrame = (ms) => new Promise((res) => {
      let done = false; const go = () => { if (done) return; done = true; res(); };
      if (video && video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => go());
      else go();
      setTimeout(go, ms);
    });

    stream = await md.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 30, cursor: 'never' },
      audio: false, preferCurrentTab: true, selfBrowserSurface: 'include',
    });
    await sleep(200);
    const track = stream.getVideoTracks()[0];

    // Element Capture sul div target → niente cursore + un frame a ogni render. Fallback Region Capture.
    let cropped = false;
    try {
      if (window.RestrictionTarget && RestrictionTarget.fromElement && track.restrictTo) {
        await track.restrictTo(await RestrictionTarget.fromElement(target)); cropped = true;
      } else if (window.CropTarget && CropTarget.fromElement && track.cropTo) {
        await track.cropTo(await CropTarget.fromElement(target)); cropped = true;
      }
    } catch (_) { cropped = false; }

    video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    video.style.cssText = 'position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
    try { window.focus(); } catch (_) { /* noop */ }
    video.play().catch(() => {}); // NON awaited: con un track di cattura play() può restare pending
    await waitFrame(1800);

    const images = [];
    const n = deck.slides.length;
    for (let i = 0; i < n; i++) {
      await renderSlide(i);
      await sleep(120);      // assestamento layout + decode background-image data: URI
      await waitFrame(450);  // 1° frame fresco (in transito) — Element Capture lo emette a ogni render
      await waitFrame(450);  // 2° frame: garantisce che rifletta GIÀ la slide corrente (no sfasamenti)

      const fw = video.videoWidth || 1, fh = video.videoHeight || 1;
      let sx = 0, sy = 0, sw = fw, sh = fh;
      if (!cropped) {
        const kx = fw / window.innerWidth, ky = fh / window.innerHeight;
        const r = target.getBoundingClientRect();
        sx = Math.max(0, Math.round(r.left * kx)); sy = Math.max(0, Math.round(r.top * ky));
        sw = Math.round(r.width * kx); sh = Math.round(r.height * ky);
      }
      const outW = Math.max(1, sw), outH = Math.max(1, Math.round(outW * ch / cw));
      const canvas = document.createElement('canvas');
      canvas.width = outW; canvas.height = outH;
      canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
      images.push(canvas.toDataURL('image/jpeg', 0.92));
      if (typeof opts.onProgress === 'function') opts.onProgress(i + 1, n);
    }
    return images;
  } finally {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (video) { try { video.pause(); video.srcObject = null; video.remove(); } catch (_) { /* noop */ } }
    document.documentElement.style.cursor = prevCursor;
    if (overlay) overlay.remove();
  }
}

/** Cattura le slide dal render reale e apre la stampa del PDF (immagini → identico ovunque). */
export async function captureDeckToPdf(deck, opts = {}) {
  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h;
  const images = await captureDeck(deck, opts);
  if (!images.length) throw new Error('Nessun fotogramma catturato.');
  return printDocument(buildRasterPrintHtml(deck, images), cw, ch);
}

/**
 * Scrive l'HTML di stampa in un iframe nascosto, attende il caricamento dei contenuti
 * annidati (iframe-pagina del vettoriale OPPURE immagini del raster) e lancia il dialogo.
 * Pulizia su `afterprint` (su Windows rimuovere l'iframe a stampa in corso blocca il file).
 */
function printDocument(html, cw, ch) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, {
      position: 'fixed', left: '-99999px', top: '0',
      width: `${cw}px`, height: `${ch}px`, border: '0', visibility: 'hidden',
    });
    document.body.append(iframe);

    const doc = iframe.contentDocument;
    doc.open(); doc.write(html); doc.close();

    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; iframe.remove(); resolve(); };
    const fire = () => {
      const w = iframe.contentWindow;
      const d = iframe.contentDocument;
      // Attendi iframe-pagina annidati (vettoriale) E immagini (raster) prima di stampare:
      // print() prematura stamperebbe pagine vuote.
      const frames = [].slice.call(d.querySelectorAll('iframe.ss-print-fr'));
      const imgs = [].slice.call(d.querySelectorAll('img.ss-raster'));
      const waits = [];
      frames.forEach((fr) => waits.push(new Promise((res) => {
        try { if (fr.contentDocument && fr.contentDocument.readyState === 'complete') return res(); } catch (_) { /* srcdoc same-origin */ }
        fr.addEventListener('load', () => res(), { once: true });
        setTimeout(res, 4000);
      })));
      imgs.forEach((im) => waits.push(new Promise((res) => {
        if (im.complete && im.naturalWidth) return res();
        im.addEventListener('load', () => res(), { once: true });
        im.addEventListener('error', () => res(), { once: true });
        setTimeout(res, 4000);
      })));
      Promise.all(waits).then(() => {
        w.requestAnimationFrame(() => w.requestAnimationFrame(() => {
          w.addEventListener('afterprint', () => setTimeout(cleanup, 300), { once: true });
          setTimeout(cleanup, 120000); // fallback: alcuni browser non emettono afterprint
          try { w.focus(); w.print(); } catch (_) { setTimeout(cleanup, 800); }
        }));
      });
    };
    if (iframe.contentWindow.document.readyState === 'complete') setTimeout(fire, 150);
    else iframe.addEventListener('load', () => setTimeout(fire, 150), { once: true });
  });
}

/**
 * Esporta/stampa in PDF. Per default RASTERIZZA (`raster:true`): fedele su ogni device.
 * Se la rasterizzazione fallisce (o `raster:false`) ricade sul PDF vettoriale (testo
 * selezionabile, ma soggetto alle differenze di rendering fra viewer su deck con trasparenze).
 * I deck in modalità documento usano sempre il vettoriale (impaginazione A4 naturale).
 */
export async function exportPdf(deck, opts = {}) {
  const raster = opts.raster !== false;
  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h;

  if (raster && (deck.mode || 'deck') !== 'doc') {
    try {
      const images = await rasterizeDeck(deck);
      if (images.length) return printDocument(buildRasterPrintHtml(deck, images), cw, ch);
    } catch (e) {
      // Fallback trasparente al vettoriale: meglio un PDF (anche con il limite mobile) che nessuno.
      if (typeof console !== 'undefined') console.warn('[Slidewright] PDF raster fallito, uso il vettoriale:', e);
    }
  }
  return printDocument(buildPrintHtml(deck), cw, ch);
}
