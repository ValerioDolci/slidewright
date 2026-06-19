/**
 * Import: deck.html (stringa) → modello Deck.
 * Riconosce il formato reale dei deck del workspace:
 *   <head><style>…</style></head>
 *   <body> … <section class="slide [active]"> … </section> … </body>
 */

import { CANVAS } from './model.js';
import { uid } from '../util/id.js';
import { externalize } from './assets.js';

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

  // Slide: <section class="slide">. Fallback progressivi se assenti.
  let sections = Array.from(doc.querySelectorAll('section.slide, .slide'));
  if (sections.length === 0) sections = Array.from(doc.querySelectorAll('.deck > section, section'));

  // sicurezza: niente <script> nelle slide (no esecuzione codice nell'editor/export).
  // + externalize: le immagini base64 vanno nel pool asset (history leggera).
  const prep = (node) => {
    node.querySelectorAll('script').forEach((n) => n.remove());
    return externalize(node.innerHTML.trim());
  };

  let slides;
  if (sections.length > 0) {
    slides = sections.map((sec) => ({
      id: uid('sl'),
      classes: Array.from(sec.classList).filter((c) => c !== 'slide' && c !== 'active'),
      html: prep(sec),
    }));
  } else {
    warnings.push('Nessuna <section class="slide"> trovata: importata come singola slide.');
    slides = [{ id: uid('sl'), classes: [], html: doc.body ? prep(doc.body) : '' }];
  }

  return { meta, canvas: { ...CANVAS }, styleCss, slides, _warnings: warnings };
}
