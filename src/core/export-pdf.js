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
// Differenza con il raster snapdom: qui NON si ri-disegna il DOM (snapdom approssima → reflow
// dei titoli, colori spenti). Si fa uno SCREENSHOT del RENDER REALE del browser via Screen
// Capture API (getDisplayMedia) → fedele al 100% (è una "foto" di ciò che il browser disegna),
// e senza trasparenze nel PDF → identico su ogni viewer/device (aggira il bug Skia del PDF
// vettoriale). Richiede UN consenso utente per export (Chrome/Edge ricordano per la sessione).
// Region Capture (track.cropTo su CropTarget) limita la cattura al solo stage 16:9 → niente
// ritaglio/bande; fallback: ritaglio manuale del rettangolo 16:9 centrato.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cattura ogni slide come immagine dal render REALE del browser (Screen Capture API).
 * Ritorna un array di dataURL PNG (in ordine). Mostra un overlay a piena pagina durante la cattura.
 * @param {object} deck @param {{onProgress?:(i:number,n:number)=>void}} [opts]
 */
export async function captureDeck(deck, opts = {}) {
  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h;
  const md = navigator.mediaDevices;
  if (!md || !md.getDisplayMedia) throw new Error('Cattura schermo non supportata da questo browser.');

  // Overlay a piena pagina: sfondo nero + stage 16:9 a misura-canvas, scalato a riempire.
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', background: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    cursor: 'none', // l'overlay copre tutta la scheda → con cursor:none il browser NON disegna
  });               // il puntatore: la cattura DELLA SCHEDA non lo include (cursor:'never' su
                    // Edge/Windows è inaffidabile; questo è il rimedio che funziona per tab capture).
  const stage = document.createElement('iframe');
  stage.setAttribute('aria-hidden', 'true');
  Object.assign(stage.style, {
    width: `${cw}px`, height: `${ch}px`, border: '0', background: '#fff',
    transformOrigin: 'center center',
  });
  // Scala lo stage per riempire il viewport CORRENTE (va ricalcolato dopo il fullscreen, che
  // cambia innerWidth/Height): a piena risoluzione = cattura più nitida.
  const fitStage = () => {
    const s = Math.min(window.innerWidth / cw, window.innerHeight / ch);
    stage.style.transform = `scale(${s})`;
  };
  fitStage();
  overlay.appendChild(stage);
  document.body.appendChild(overlay);
  // nascondi il cursore anche a livello documento durante la cattura (ripristino nel finally)
  const prevCursor = document.documentElement.style.cursor;
  document.documentElement.style.cursor = 'none';

  let stream;
  try {
    stream = await md.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 30, cursor: 'never' },
      audio: false,
      preferCurrentTab: true,      // Chromium: propone direttamente "questa scheda"
      selfBrowserSurface: 'include',
    });
    await sleep(200);

    const track = stream.getVideoTracks()[0];

    // Region Capture (cropTo): ritaglia il frame al solo stage. NB: Element Capture (restrictTo)
    // escluderebbe il cursore ma su un IFRAME produce frame VUOTI → non utilizzabile qui.
    let cropped = false; // true se il frame è già il solo stage
    try {
      if (window.CropTarget && CropTarget.fromElement && track.cropTo) {
        const ct = await CropTarget.fromElement(stage);
        await track.cropTo(ct);
        cropped = true;
      }
    } catch (_) { cropped = false; }

    // Sorgente video per i frame.
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play().catch(() => {});
    await sleep(250); // assestamento pipeline di cattura

    const ic = ('ImageCapture' in window) ? new ImageCapture(track) : null;
    const grab = async () => {
      if (ic && ic.grabFrame) { try { return await ic.grabFrame(); } catch (_) { /* fallback */ } }
      return await createImageBitmap(video);
    };

    const images = [];
    const n = deck.slides.length;

    for (let i = 0; i < n; i++) {
      // Renderizza la slide nello stage (doc.write → eredita l'origine: niente vincoli same-origin).
      const inner = buildInnerDeckDoc({ ...deck, slides: [deck.slides[i]] });
      await new Promise((res) => {
        // Guard `done` + removeEventListener su ENTRAMBI i rami: senza, sul ramo-timeout il
        // listener 'load' resterebbe attaccato e potrebbe risolvere la slide SUCCESSIVA in
        // anticipo (frame vuoto/stantio). Vedi peer-review.
        let done = false;
        const finish = () => { if (done) return; done = true; stage.removeEventListener('load', finish); res(); };
        stage.addEventListener('load', finish);
        const d = stage.contentDocument; d.open(); d.write(inner); d.close();
        setTimeout(finish, 1400);
      });
      // NB: niente requestAnimationFrame — durante la condivisione la scheda può essere
      // "throttled"/in background e i rAF non scattano (loop bloccato). I timer sì.
      await sleep(320); // assestamento layout + arrivo del frame nuovo nello stream

      const bmp = await grab();
      // Mappatura derivata dalla dimensione REALE del frame (robusta a dpr / scaling interno
      // del track): NON usare devicePixelRatio, che non corrisponde alla dimensione del frame.
      let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
      if (!cropped) {
        const kx = bmp.width / window.innerWidth, ky = bmp.height / window.innerHeight;
        const r = stage.getBoundingClientRect();
        sx = Math.max(0, Math.round(r.left * kx));
        sy = Math.max(0, Math.round(r.top * ky));
        sw = Math.round(r.width * kx);
        sh = Math.round(r.height * ky);
      }
      // Risoluzione di uscita = quella CATTURATA (niente upscaling finto), normalizzata a 16:9.
      const outW = Math.max(1, sw), outH = Math.max(1, Math.round(outW * ch / cw));
      const canvas = document.createElement('canvas');
      canvas.width = outW; canvas.height = outH;
      canvas.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, outW, outH);
      if (bmp.close) bmp.close();
      images.push(canvas.toDataURL('image/jpeg', 0.92)); // screenshot → JPEG: 3-5× più leggero
      if (typeof opts.onProgress === 'function') opts.onProgress(i + 1, n);
    }
    return images;
  } finally {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    document.documentElement.style.cursor = prevCursor;
    overlay.remove();
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
