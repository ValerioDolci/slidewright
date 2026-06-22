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
<div class="footer"><span>Slidewright</span><span></span></div>`;
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
    mode: 'deck',            // 'deck' (slide 16:9) | 'doc' (documento HTML a pagina libera)
    canvas: { ...CANVAS },
    styleCss,
    slides: [
      { ...createSlide(titleSlideHtml(title, 'Creato con Slidewright')) },
      { ...createSlide() },
    ],
  };
}

/* Slide di benvenuto/istruzioni mostrate all'avvio (al posto di un deck di test
 * non editabile). Sono slide normali: editabili, eliminabili, sostituite appena
 * apri un tuo file o premi "Nuovo". Usano le classi del tema di default. */
const WELCOME_SLIDE_1 = `<div class="header">
  <span class="badge">◳ Slidewright</span>
  <span class="badge">Editor di deck HTML</span>
</div>
<div class="content" style="align-content:center;text-align:center">
  <h1 style="font-size:60px">Benvenuto in Slidewright</h1>
  <p class="muted" style="font-size:24px;max-width:820px;margin:0 auto">Apri un deck <b style="color:var(--text)">.html</b>, modificalo come in un mini-PowerPoint ed esporta di nuovo in HTML o PDF. Tutto in locale, niente cloud.</p>
  <div class="pill-row" style="justify-content:center;margin-top:22px">
    <span class="pill">Trascina qui un file .html per aprirlo</span>
    <span class="pill">oppure premi “Nuovo” per partire da zero</span>
  </div>
</div>
<div class="footer"><span>Suggerimento: fai doppio click su questo testo per modificarlo.</span><span>1 / 2</span></div>`;

const WELCOME_SLIDE_2 = `<div class="header"><span class="badge">Come si usa</span></div>
<div class="content">
  <h2>Gesti e scorciatoie</h2>
  <div class="grid-2">
    <div class="card">
      <h3>Selezionare e scrivere</h3>
      <ul>
        <li><b>Click</b> su un elemento per selezionarlo</li>
        <li><b>Click di nuovo</b> (o doppio click) sul testo per scriverci</li>
        <li><b>⌥-click</b> per scegliere l'elemento <i>sotto</i> a quelli sovrapposti</li>
        <li><b>Tab</b> / <b>⇧Tab</b> per scorrere gli elementi della slide</li>
      </ul>
    </div>
    <div class="card">
      <h3>Spostare e sistemare</h3>
      <ul>
        <li><b>Trascina la crocetta ✥</b> sopra il box per spostare · <b>maniglie</b> per ridimensionare</li>
        <li><b>Frecce</b> spostano di 1px (<b>Shift</b> = 10px)</li>
        <li><b>Canc</b> elimina · <b>⌘Z</b>/<b>⇧⌘Z</b> annulla/ripeti · <b>⌘S</b> salva</li>
        <li><b>Esc</b> deseleziona</li>
      </ul>
    </div>
  </div>
  <div class="pill-row">
    <span class="pill">Aggiungi Testo · Forma · Immagine dalla barra in alto</span>
    <span class="pill">Premi “?” in alto a destra per riaprire questa guida</span>
  </div>
</div>
<div class="footer"><span>Pronto? Trascina un deck .html oppure premi “Nuovo”.</span><span>2 / 2</span></div>`;

const WELCOME_EN_1 = `<div class="header">
  <span class="badge">◳ Slidewright</span>
  <span class="badge">HTML deck editor</span>
</div>
<div class="content" style="align-content:center;text-align:center">
  <h1 style="font-size:60px">Welcome to Slidewright</h1>
  <p class="muted" style="font-size:24px;max-width:820px;margin:0 auto">Open an <b style="color:var(--text)">.html</b> deck, edit it like a mini-PowerPoint and export back to HTML or PDF. All local, no cloud.</p>
  <div class="pill-row" style="justify-content:center;margin-top:22px">
    <span class="pill">Drag an .html file here to open it</span>
    <span class="pill">or press “New” to start from scratch</span>
  </div>
</div>
<div class="footer"><span>Tip: double-click this text to edit it.</span><span>1 / 2</span></div>`;

const WELCOME_EN_2 = `<div class="header"><span class="badge">How it works</span></div>
<div class="content">
  <h2>Gestures &amp; shortcuts</h2>
  <div class="grid-2">
    <div class="card">
      <h3>Select &amp; type</h3>
      <ul>
        <li><b>Click</b> an element to select it</li>
        <li><b>Click again</b> (or double-click) on text to type into it</li>
        <li><b>⌥-click</b> to pick the element <i>below</i> overlapping ones</li>
        <li><b>Tab</b> / <b>⇧Tab</b> to cycle through the slide elements</li>
      </ul>
    </div>
    <div class="card">
      <h3>Move &amp; arrange</h3>
      <ul>
        <li><b>Drag the ✥ handle</b> above the box to move · <b>handles</b> to resize</li>
        <li><b>Arrows</b> move 1px (<b>Shift</b> = 10px)</li>
        <li><b>Del</b> delete · <b>⌘Z</b>/<b>⇧⌘Z</b> undo/redo · <b>⌘S</b> save</li>
        <li><b>Esc</b> deselect</li>
      </ul>
    </div>
  </div>
  <div class="pill-row">
    <span class="pill">Add Text · Shape · Image from the top bar</span>
    <span class="pill">Press “?” at the top right to reopen this guide</span>
  </div>
</div>
<div class="footer"><span>Ready? Drag an .html deck or press “New”.</span><span>2 / 2</span></div>`;

/** Deck iniziale (benvenuto + istruzioni) nella lingua dell'interfaccia.
 *  Editabile come qualsiasi altro deck; viene sostituito appena apri un file. */
export function welcomeDeck(lang = 'it') {
  const en = lang === 'en';
  return {
    meta: { title: en ? 'Welcome — Slidewright' : 'Benvenuto — Slidewright', lang: en ? 'en' : 'it' },
    mode: 'deck',
    canvas: { ...CANVAS },
    styleCss: DEFAULT_STYLE_CSS,
    slides: [
      createSlide(en ? WELCOME_EN_1 : WELCOME_SLIDE_1),
      createSlide(en ? WELCOME_EN_2 : WELCOME_SLIDE_2),
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
