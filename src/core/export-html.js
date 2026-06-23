/**
 * Export: modello Deck → HTML pulito, standalone, ri-apribile (sia dall'editor
 * sia da Claude). Strip totale degli attributi interni dell'editor.
 *
 * Strategia di compatibilità:
 *  - il wrapper riceve class="deck ss-deck": le regole `.deck`/`.slide` del deck
 *    importato continuano a valere;
 *  - un piccolo runtime (CSS via :where → specificità 0 + JS di navigazione)
 *    riempie SOLO i buchi (es. deck nuovi che non definiscono la logica .active),
 *    senza mai sovrascrivere l'estetica del deck.
 */

import { EDITOR_ATTR } from '../util/id.js';
import { inline } from './assets.js';
import { sanitizeFragment } from './sanitize.js';
import { CANVAS } from './model.js';

/** Credito discreto cucito in ogni export (commento: invisibile a chi guarda il deck). */
export const CREDIT = '<!-- Made with Slidewright · di Valerio Dolci · github.com/ValerioDolci/slidewright -->';

/** Rimuove dagli elementi gli attributi interni dell'editor + reinserisce gli asset. */
export function cleanSlideHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = inline(html, { forExport: true }); // base64 reali, via attr asset rimosso
  sanitizeFragment(tpl.content); // mai esportare script / handler inline / javascript:
  tpl.content.querySelectorAll('*').forEach((node) => {
    node.removeAttribute(EDITOR_ATTR);
    node.removeAttribute('contenteditable');
    node.removeAttribute('spellcheck');
    node.classList.remove('ss-selected', 'ss-editing');
    if (node.classList.length === 0) node.removeAttribute('class');
    if (node.getAttribute('style') === '') node.removeAttribute('style');
  });
  return tpl.innerHTML.trim();
}

// PRESENTAZIONE = EDITOR = PDF (WYSIWYG): il deck è reso su uno STAGE di dimensione
// LOGICA fissa (CANVAS, lo stesso del canvas dell'editor) e scalato uniformemente per
// riempire lo schermo (letterbox). Così gli elementi a px assoluti cadono ESATTAMENTE
// dove ci si aspetta e i font/px non si spaginano a risoluzioni diverse.
//
// Il deck vive dentro un <iframe> 1280×720 (via srcdoc): l'iframe crea il PROPRIO
// viewport, quindi anche le unità vh/vw risolvono a 1280×720 — IDENTICHE all'editor (che
// è anch'esso un iframe 1280×720). È la parità totale (px, %, vh, vw). La shell esterna
// scala l'iframe e disegna le bande nere; la navigazione (frecce + bottoni) parla con
// l'iframe via window.__ssNav. Il PDF resta a pagine fisse 1280×720 (file a parte).

// --- CSS dentro l'iframe (contesto del deck) ---
// La slide è forzata a 1280×720 ESATTAMENTE come fa l'editor (IFRAME_CSS di stage.js:
// `.ss-root{position:absolute !important; inset:0}`). Senza questo, un deck che dà alla
// `.slide` una propria altezza/min-height/position (o usa vh) la renderebbe più alta del
// canvas → layout verticale diverso dall'editor ("la parte bassa si sposta"). Forzandolo,
// presentazione = editor pixel-per-pixel.
// [F1] canvas PER-DECK (cw/ch): la stessa logica vale per qualsiasi misura 16:9.
const innerCss = (cw, ch) => `
html,body{margin:0;width:100%;height:100%;overflow:hidden}
/* il wrapper riempie SEMPRE l'iframe (${cw}×${ch}) ed è il blocco contenitore delle slide:
   senza forzarlo, un deck con regole proprie su .deck gli darebbe un'altezza diversa →
   la slide erediterebbe quell'altezza e si spaginerebbe rispetto all'editor. */
.ss-deck{position:absolute !important;inset:0 !important;width:auto !important;
  height:auto !important;margin:0 !important;overflow:hidden}
/* stesse forzature dell'editor (IFRAME_CSS .ss-root): riempi il canvas ${cw}×${ch} e
   NEUTRALIZZA eventuali transform/transition del deck sulla slide (animazioni d'entrata). */
.ss-deck > .slide{position:absolute !important;left:0 !important;top:0 !important;
  right:auto !important;bottom:auto !important;margin:0 !important;
  width:${cw}px !important;height:${ch}px !important;
  transform:none !important;transition:opacity .35s ease !important}
/* mechanics di navigazione con specificità REALE: il runtime decide SEMPRE quale slide
   è visibile, anche se il CSS del deck stila .slide (es. opacity/display/visibility). */
.ss-deck > .slide:not(.active){opacity:0;visibility:hidden;pointer-events:none}
.ss-deck > .slide.active{opacity:1;visibility:visible;pointer-events:auto}`;

// --- JS dentro l'iframe: naviga le slide + espone window.__ssNav alla shell ---
const INNER_JS = `(function(){
  var slides=[].slice.call(document.querySelectorAll('.ss-deck > .slide'));
  if(!slides.length)return;
  var i=Math.max(0,slides.findIndex(function(s){return s.classList.contains('active')})); if(i<0)i=0;
  function show(n){i=Math.max(0,Math.min(n,slides.length-1));
    slides.forEach(function(s,k){s.classList.toggle('active',k===i)});
    try{parent.postMessage({__ss:'pos',i:i,n:slides.length},'*')}catch(e){}}
  function next(){show(i+1)} function prev(){show(i-1)}
  window.__ssNav={next:next,prev:prev,go:show,count:function(){return slides.length}};
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ')next();
    else if(e.key==='ArrowLeft'||e.key==='PageUp')prev();
    else if(e.key==='Home')show(0); else if(e.key==='End')show(slides.length-1);});
  show(i);
})();`;

// --- CSS della shell esterna (letterbox + scala) ---
const shellCss = (cw, ch) => `
html,body{margin:0;height:100%}
body{background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden}
.ss-stage{flex:none;border:0;display:block;background:#000;
  width:${cw}px;height:${ch}px;transform-origin:center center}
.ss-nav{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;
  display:flex;gap:10px;align-items:center;font:13px ui-monospace,Menlo,monospace;
  color:#fff;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.18);
  border-radius:999px;padding:6px 12px;backdrop-filter:blur(6px);opacity:.0;transition:opacity .3s}
body:hover .ss-nav{opacity:.9}
.ss-nav button{all:unset;cursor:pointer;padding:2px 8px;border-radius:6px}
.ss-nav button:hover{background:rgba(255,255,255,.18)}
@media print{.ss-nav{display:none}}`;

// --- JS della shell: scala l'iframe al viewport + instrada le frecce all'iframe ---
const shellJs = (cw, ch) => `(function(){
  var W=${cw},H=${ch};
  var frame=document.querySelector('.ss-stage'), counter=document.querySelector('.ss-nav__c');
  function fit(){ if(frame){ var s=Math.min(window.innerWidth/W, window.innerHeight/H); frame.style.transform='scale('+s+')'; } }
  window.addEventListener('resize',fit); window.addEventListener('orientationchange',fit);
  window.addEventListener('message',function(e){ var d=e.data; if(d&&d.__ss==='pos'&&counter) counter.textContent=(d.i+1)+' / '+d.n; });
  function nav(){ try{ return frame && frame.contentWindow && frame.contentWindow.__ssNav; }catch(e){ return null; } }
  document.addEventListener('keydown',function(e){ var n=nav(); if(!n)return;
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ')n.next();
    else if(e.key==='ArrowLeft'||e.key==='PageUp')n.prev();
    else if(e.key==='Home')n.go(0); else if(e.key==='End')n.go(n.count()-1);});
  var p=document.querySelector('.ss-nav [data-p]'), nx=document.querySelector('.ss-nav [data-n]');
  if(p)p.onclick=function(){var n=nav();if(n)n.prev();};
  if(nx)nx.onclick=function(){var n=nav();if(n)n.next();};
  if(frame){ frame.addEventListener('load',function(){ fit(); try{frame.contentWindow.focus();}catch(e){} }); }
  fit();
})();`;

/** Documento INTERNO all'iframe: il deck vero (styleCss + sezioni + nav). */
function buildInnerDeckDoc(deck) {
  const lang = deck.meta?.lang || 'it';
  const title = deck.meta?.title || 'Deck';
  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h; // [F1] canvas per-deck
  const sections = deck.slides
    .map((s, idx) => {
      const cls = ['slide', ...(s.classes || []), idx === 0 ? 'active' : ''].filter(Boolean).join(' ');
      const id = s.elId ? ` id="${s.elId}"` : ''; // preserva l'id (CSS #slide-N del deck)
      return `<section${id} class="${cls}">${cleanSlideHtml(s.html)}</section>`;
    })
    .join('\n');
  return `<!DOCTYPE html>${CREDIT}<html lang="${escapeAttr(lang)}"><head><meta charset="UTF-8" />` +
    // [F2] canvas persistito: alla riapertura l'import lo legge come autorevole (no re-detect)
    `<meta name="slidewright:canvas" content="${cw}x${ch}" />` +
    `<title>${escapeHtml(title)}</title>\n<style>\n${deck.styleCss || ''}\n</style>\n` +
    `<style data-ss-runtime>${innerCss(cw, ch)}</style></head>` +
    `<body><div class="deck ss-deck">\n${sections}\n</div>` +
    `<script data-ss-runtime>${INNER_JS}</script></body></html>`;
}

export function buildDeckHtml(deck) {
  if ((deck.mode || 'deck') === 'doc') return buildDocHtml(deck);
  const lang = deck.meta?.lang || 'it';
  const title = deck.meta?.title || 'Deck';
  const cw = deck.canvas?.w || CANVAS.w, ch = deck.canvas?.h || CANVAS.h; // [F1] canvas per-deck
  const srcdoc = escapeSrcdoc(buildInnerDeckDoc(deck));

  return `<!DOCTYPE html>
${CREDIT}
<html lang="${escapeAttr(lang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style data-ss-runtime>${shellCss(cw, ch)}</style>
</head>
<body>
  <iframe class="ss-stage" title="${escapeAttr(title)}" srcdoc="${srcdoc}"></iframe>
  <div class="ss-nav" aria-hidden="true">
    <button data-p title="Precedente">‹</button>
    <span class="ss-nav__c"></span>
    <button data-n title="Successiva">›</button>
  </div>
  <script data-ss-runtime>${shellJs(cw, ch)}</script>
</body>
</html>
`;
}

/** Export in modalità documento: HTML normale (no wrapper deck/nav). */
function buildDocHtml(deck) {
  const lang = deck.meta?.lang || 'it';
  const title = deck.meta?.title || 'Documento';
  const content = cleanSlideHtml(deck.slides[0]?.html || '');
  return `<!DOCTYPE html>
${CREDIT}
<html lang="${escapeAttr(lang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
${indent(deck.styleCss || '', 4)}
  </style>
</head>
<body>
${indent(content, 2)}
</body>
</html>
`;
}

function indent(text, n) {
  const pad = ' '.repeat(n);
  return String(text)
    .split('\n')
    .map((l) => (l ? pad + l : l))
    .join('\n');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
/** Escape per l'attributo `srcdoc`: SOLO & e " (i < > devono restare HTML letterale). */
function escapeSrcdoc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
