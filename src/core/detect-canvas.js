/**
 * [F2] Rilevazione della MISURA del canvas di un deck importato.
 *
 * Principio (revisione Opus): NON inferire dalla bbox di contenuto fluido. Si rende la
 * slide a DUE dimensioni di viewport molto diverse e si confronta:
 *  - se larghezza E altezza restano STABILI (≈uguali) → il deck ha una misura FISSA;
 *    se è ~16:9 la si ADOTTA come `deck.canvas` (identico, zero riscrittura px);
 *  - se variano → è RESPONSIVE → canvas canonico 1280×720 (il responsive si adatta a
 *    qualsiasi canvas in modo identico).
 *  - fisso ma NON 16:9 → per ora canonico 1280×720 + avviso (letterbox vero = passo futuro).
 *
 * Mirroring del rendering dell'editor: `<section class="slide …">` direttamente nel body,
 * con lo styleCss del deck (come fa lo Stage), così la misura rilevata = quella reale.
 */

import { inline } from './assets.js';
import { CANVAS } from './model.js';

const SIXTEEN_NINE = 16 / 9;

function renderMeasure(styleCss, slide, W, H) {
  return new Promise((resolve) => {
    const f = document.createElement('iframe');
    Object.assign(f.style, {
      position: 'fixed', left: '-99999px', top: '0',
      width: `${W}px`, height: `${H}px`, border: '0', visibility: 'hidden',
    });
    document.body.append(f);
    const d = f.contentDocument;
    const idAttr = slide.elId ? ` id="${slide.elId}"` : '';
    d.open();
    d.write(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${styleCss || ''}</style>` +
      `<style>html,body{margin:0}</style></head>` +
      `<body><section${idAttr} class="slide active ${(slide.classes || []).join(' ')}">${inline(slide.html)}</section></body></html>`
    );
    d.close();
    const done = () => {
      const sec = d.querySelector('section.slide') || d.body;
      const w = sec.offsetWidth, h = sec.offsetHeight;
      f.remove();
      resolve({ w, h });
    };
    if (d.readyState === 'complete') setTimeout(done, 40);
    else f.addEventListener('load', () => setTimeout(done, 40), { once: true });
  });
}

/**
 * Rileva il canvas del deck dal rendering della slide rappresentativa.
 * Ritorna { w, h, kind, detected? }. kind ∈ 'canonical' | 'fixed' | 'fixed-non169' | 'responsive'.
 */
export async function detectDeckCanvas(styleCss, slide) {
  if (!slide || typeof document === 'undefined') return { w: CANVAS.w, h: CANVAS.h, kind: 'canonical' };
  let a, b;
  try {
    a = await renderMeasure(styleCss, slide, 2400, 1500);
    b = await renderMeasure(styleCss, slide, 3200, 2000);
  } catch (_) {
    return { w: CANVAS.w, h: CANVAS.h, kind: 'canonical' };
  }
  const fixedW = Math.abs(a.w - b.w) <= 2 && a.w >= 240;
  const fixedH = Math.abs(a.h - b.h) <= 2 && a.h >= 160;
  if (fixedW && fixedH) {
    const aspect = a.w / a.h;
    if (Math.abs(aspect - SIXTEEN_NINE) < 0.03) {
      return { w: Math.round(a.w), h: Math.round(a.h), kind: 'fixed' };       // 16:9 a misura propria → adotta
    }
    return { w: CANVAS.w, h: CANVAS.h, kind: 'fixed-non169', detected: { w: Math.round(a.w), h: Math.round(a.h) } };
  }
  return { w: CANVAS.w, h: CANVAS.h, kind: 'responsive' };                     // responsive → canonico
}
