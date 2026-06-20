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
  const warnings = [];

  const meta = {
    title: (doc.querySelector('title')?.textContent || 'Deck importato').trim(),
    lang: doc.documentElement.getAttribute('lang') || 'it',
  };

  // Tutti i blocchi <style> (head + body), nell'ordine del documento.
  let styleCss = Array.from(doc.querySelectorAll('style'))
    .map((s) => s.textContent || '')
    .join('\n\n')
    .trim();

  // Font esterni: @import nei <style> + <link rel=stylesheet> in head.
  const fontStrip = stripExternalFonts(styleCss);
  styleCss = fontStrip.css;
  const fontLinks = Array.from(doc.querySelectorAll('link[href]'))
    .filter((l) => FONT_HOST.test(l.getAttribute('href') || ''));
  if (fontStrip.found || fontLinks.length) {
    warnings.push('Font esterni (Google Fonts) rilevati e rimossi: il deck userà i font di sistema.');
  }

  // Deck = elementi con classe `.slide` (marcatore canonico). Se manca, un
  // eventuale wrapper `.deck` con figli <section> conta come deck. Tutto il resto
  // (incl. documenti che usano <section> semantici) → modalità documento.
  let sections = Array.from(doc.querySelectorAll('section.slide, .slide'));
  if (sections.length === 0) {
    const deckWrap = doc.querySelector('.deck');
    if (deckWrap) sections = Array.from(deckWrap.querySelectorAll(':scope > section'));
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
      classes: Array.from(sec.classList).filter((c) => c !== 'slide' && c !== 'active'),
      html: prep(sec),
    }));
  } else {
    // HTML generico (non un deck): modalità documento, una pagina col body intero.
    mode = 'doc';
    warnings.push('HTML non-slide: aperto in modalità documento (pagina libera, scrollabile).');
    slides = [{ id: uid('sl'), classes: [], html: doc.body ? prep(doc.body) : '' }];
  }

  return { meta, mode, canvas: { ...CANVAS }, styleCss, slides, _warnings: warnings };
}
