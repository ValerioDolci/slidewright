/**
 * Modello dati interno del deck (JSON intermedio — decisione architetturale 2:
 * più robusto del DOM-diretto per undo/redo ed export).
 *
 *   Deck = {
 *     meta:   { title, lang },
 *     canvas: { w, h },          // canvas logico fisso (decisione 4: 1280x720, 16:9)
 *     styleCss: string,          // contenuto del <style> di <head> del deck
 *     slides: [ Slide ]
 *   }
 *   Slide = { id, classes:[...], html }   // html = innerHTML della <section class="slide">
 *
 * Il DOM dentro l'iframe è la *vista di editing*; il modello è la *fonte di verità*.
 * Si serializza la slide corrente nel modello a ogni commit (vedi store.commit).
 */

import { uid } from '../util/id.js';

/** Canvas logico fisso 16:9 (decisione 4). */
export const CANVAS = Object.freeze({ w: 1280, h: 720 });

/** Tema di default per i deck NUOVI — niente Inter/Roboto (Regola 11):
 *  serif di sistema per i titoli, sans di sistema per il corpo, accento ambra. */
export const DEFAULT_STYLE_CSS = `:root{
  --bg1:#11151c; --bg2:#1b2330; --accent:#b45309; --accent2:#0e7490;
  --text:#f2efe9; --muted:#a9b1bd;
  --card:rgba(255,255,255,0.05); --border:rgba(255,255,255,0.14);
  --shadow:0 24px 60px rgba(0,0,0,0.40);
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;color:var(--text);
  font-family:-apple-system,"SF Pro Text","Helvetica Neue",sans-serif;
  background:radial-gradient(circle at 78% 12%,#243246 0%,var(--bg1) 46%,#080b10 100%);
  overflow:hidden;}
.slide{position:absolute;inset:0;padding:64px 84px;
  display:grid;grid-template-rows:auto 1fr auto;gap:18px;}
.header{display:flex;align-items:center;justify-content:space-between}
.badge{display:inline-flex;align-items:center;gap:10px;padding:9px 16px;border-radius:999px;
  background:rgba(255,255,255,0.06);border:1px solid var(--border);
  color:var(--muted);font-size:14px;letter-spacing:.4px;text-transform:uppercase;}
h1{font-family:Charter,"Iowan Old Style",Palatino,Georgia,serif;
  font-size:54px;line-height:1.06;margin:8px 0 14px;font-weight:700;}
h2{font-family:Charter,"Iowan Old Style",Palatino,Georgia,serif;
  font-size:36px;line-height:1.14;margin:6px 0 18px;}
h3{font-size:22px;margin:0 0 12px}
p,li{font-size:21px;line-height:1.5;color:var(--text)}
.muted{color:var(--muted)}
.content{display:grid;gap:24px;align-content:start}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;
  padding:24px;box-shadow:var(--shadow)}
ul{margin:0;padding-left:22px}li{margin:10px 0}
.pill-row{display:flex;flex-wrap:wrap;gap:10px}
.pill{padding:8px 15px;border-radius:999px;background:rgba(180,83,9,0.14);
  border:1px solid rgba(180,83,9,0.4);font-size:17px;color:#fbe6cf}
.footer{display:flex;justify-content:space-between;align-items:center;
  color:var(--muted);font-size:15px}`;

export function createSlide(html) {
  return {
    id: uid('sl'),
    classes: [],
    html: html != null ? html : emptySlideHtml(),
  };
}

export function emptySlideHtml(title = 'Nuova slide') {
  return `<div class="header"><span class="badge">Sezione</span></div>
<div class="content"><h2>${escapeHtml(title)}</h2>
<p class="muted">Doppio click per modificare il testo. Aggiungi elementi dalla toolbar.</p></div>
<div class="footer"><span>Slide Studio</span><span></span></div>`;
}

export function titleSlideHtml(title = 'Titolo della presentazione', subtitle = 'Sottotitolo') {
  return `<div class="header"><span class="badge">${escapeHtml(new Date().getFullYear())}</span></div>
<div class="content" style="align-content:center"><h1>${escapeHtml(title)}</h1>
<p class="muted" style="font-size:24px">${escapeHtml(subtitle)}</p></div>
<div class="footer"><span></span><span></span></div>`;
}

export function createDeck({ title = 'Nuovo deck', lang = 'it', styleCss = DEFAULT_STYLE_CSS } = {}) {
  return {
    meta: { title, lang },
    canvas: { ...CANVAS },
    styleCss,
    slides: [
      { ...createSlide(titleSlideHtml(title, 'Creato con Slide Studio')) },
      { ...createSlide() },
    ],
  };
}

/** Copia profonda del modello (snapshot per la history). */
export function cloneDeck(deck) {
  return typeof structuredClone === 'function'
    ? structuredClone(deck)
    : JSON.parse(JSON.stringify(deck));
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
