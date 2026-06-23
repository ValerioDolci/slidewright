/**
 * Import: deck.html (stringa) → modello Deck.
 * Riconosce il formato reale dei deck del workspace:
 *   <head><style>…</style></head>
 *   <body> … <section class="slide [active]"> … </section> … </body>
 */

import { CANVAS } from './model.js';
import { uid } from '../util/id.js';
import { externalize } from './assets.js';
import { sanitizeHtml } from './sanitize.js';

const FONT_HOST = /fonts\.(googleapis|gstatic)\.com/i;

/** id sicuro da reimmettere come attributo (token semplice, no spazi/virgolette). */
function safeId(id) {
  return id && /^[A-Za-z][\w:.-]*$/.test(id) ? id : '';
}

/** Rimuove gli @import a font esterni (Google Fonts) dal CSS. Regola 11/privacy. */
function stripExternalFonts(css) {
  let found = false;
  const out = css.replace(/@import\s+(?:url\()?["']?[^"')\n;]*["']?\)?\s*;?/gi, (m) => {
    if (FONT_HOST.test(m)) { found = true; return ''; }
    return m;
  });
  return { css: out, found };
}

export function parseDeck(htmlString) {
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');

  // Export "iframe-stage": il deck vero sta nel srcdoc dell'iframe → ricorri su quello.
  // (getAttribute decodifica le entità → HTML reale.) La guardia evita ricorsioni
  // infinite e iframe estranei dell'utente.
  const stageFrame = doc.querySelector('iframe.ss-stage[srcdoc]');
  if (stageFrame) {
    const inner = stageFrame.getAttribute('srcdoc') || '';
    if (/<section[^>]*class\s*=\s*["'][^"']*\bslide\b/.test(inner)) return parseDeck(inner);
  }

  const warnings = [];

  const meta = {
    title: (doc.querySelector('title')?.textContent || 'Deck importato').trim(),
    lang: doc.documentElement.getAttribute('lang') || 'it',
  };

  // Deck = elementi con classe `.slide` (marcatore canonico). Se manca, un
  // eventuale wrapper `.deck` con figli <section> conta come deck. Tutto il resto
  // (incl. documenti che usano <section> semantici) → modalità documento.
  let sections = Array.from(doc.querySelectorAll('section.slide, .slide'));
  if (sections.length === 0) {
    const deckWrap = doc.querySelector('.deck');
    if (deckWrap) sections = Array.from(deckWrap.querySelectorAll(':scope > section'));
  }

  // Stili GLOBALI = blocchi <style> NON contenuti in una slide (ordine di documento).
  // Gli <style> DENTRO una slide restano nella slide (resi in isolamento solo per
  // quella): così una slide "anomala" (es. con un <style> dalle regole globali o di
  // dimensione diversa) non spagina anche le altre slide. [bug import 2026-06-22]
  const insideSlide = (node) => sections.some((sec) => sec.contains(node));
  let styleCss = Array.from(doc.querySelectorAll('style'))
    // escludi il CSS di runtime dell'export (stage/scaling/nav): non è stile del deck
    // e, se riassorbito, contaminerebbe il rendering dell'editor (es. body{display:flex}).
    .filter((s) => !insideSlide(s) && !s.hasAttribute('data-ss-runtime'))
    .map((s) => s.textContent || '')
    .join('\n\n')
    .trim();

  // Font esterni: @import nei <style> globali + <link rel=stylesheet> in head.
  const fontStrip = stripExternalFonts(styleCss);
  styleCss = fontStrip.css;
  const fontLinks = Array.from(doc.querySelectorAll('link[href]'))
    .filter((l) => FONT_HOST.test(l.getAttribute('href') || ''));
  if (fontStrip.found || fontLinks.length) {
    warnings.push('Font esterni (Google Fonts) rilevati e rimossi: il deck userà i font di sistema.');
  }

  // Unità relative al viewport: editor e presentazione rendono in un iframe 1280×720
  // (vh/vw = 1280×720, ok), ma l'export PDF usa pagine fisse senza iframe → lì vh/vw
  // restano ancorate al viewport di stampa e possono non combaciare. Meglio px o %.
  if (/\d\s*(vh|vw|vmin|vmax)\b/i.test(styleCss)) {
    warnings.push('Il deck usa unità vh/vw: l\'export PDF (pagine fisse) potrebbe non renderle come editor/presentazione. Per il PDF usa px o % nel canvas 1280×720.');
  }

  // [F3] avvisi di fedeltà onesti (la conversione non finge):
  // - script rimossi: se il deck generava/posizionava contenuto via JS, può mancare;
  // - risorse esterne (immagini/CSS via URL http): potrebbero non caricarsi offline
  //   (l'inlining automatico è limitato da CORS → si segnala, non si forza).
  if (/<script[\s>]/i.test(htmlString)) {
    warnings.push('Script rimossi (sicurezza): se il contenuto era generato/posizionato da JS potrebbe mancare.');
  }
  if (/(?:src|href)\s*=\s*["']?https?:\/\//i.test(htmlString) || /url\(\s*['"]?https?:\/\//i.test(styleCss)) {
    warnings.push('Risorse esterne (immagini/CSS via URL) rilevate: potrebbero non caricarsi offline — meglio incorporarle.');
  }

  // sicurezza: niente <script> né handler inline (on*) / javascript: nelle slide
  // (no esecuzione codice nell'editor/export). + externalize: le immagini base64
  // vanno nel pool asset (history leggera).
  const prep = (node) => externalize(sanitizeHtml(node.innerHTML.trim()));

  let slides;
  let mode;
  if (sections.length > 0) {
    mode = 'deck';
    slides = sections.map((sec) => ({
      id: uid('sl'),
      // id ORIGINALE del contenitore (molti deck stilano le slide per id: #slide-9 …):
      // va preservato altrimenti la formattazione di quelle slide salta ("spaginata").
      elId: safeId(sec.getAttribute('id')),
      classes: Array.from(sec.classList).filter((c) => c !== 'slide' && c !== 'active'),
      html: prep(sec),
    }));
  } else {
    // HTML generico (non un deck): modalità documento, una pagina col body intero.
    mode = 'doc';
    warnings.push('HTML non-slide: aperto in modalità documento (pagina libera, scrollabile).');
    slides = [{ id: uid('sl'), classes: [], html: doc.body ? prep(doc.body) : '' }];
  }

  // [F2] canvas: se l'export Slidewright ha persistito la misura (meta), è autorevole →
  // niente re-detection (round-trip stabile). Altrimenti default canonico; sarà l'app a
  // rilevarlo (detect-canvas) al caricamento.
  let canvas = { ...CANVAS };
  let canvasFromMeta = false;
  const cm = doc.querySelector('meta[name="slidewright:canvas"]')?.getAttribute('content');
  const m = cm && cm.match(/^(\d{2,5})x(\d{2,5})$/);
  if (m) { canvas = { w: +m[1], h: +m[2] }; canvasFromMeta = true; }

  return { meta, mode, canvas, _canvasFromMeta: canvasFromMeta, styleCss, slides, _warnings: warnings };
}
