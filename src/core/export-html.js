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

const RUNTIME_CSS = `
:where(.ss-deck){position:relative;width:100vw;height:100vh;overflow:hidden}
:where(.ss-deck) > :where(.slide){position:absolute;inset:0;opacity:0;visibility:hidden;
  pointer-events:none;transition:opacity .35s ease}
:where(.ss-deck) > :where(.slide.active){opacity:1;visibility:visible;pointer-events:auto}
.ss-nav{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;
  display:flex;gap:10px;align-items:center;font:13px ui-monospace,Menlo,monospace;
  color:#fff;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.18);
  border-radius:999px;padding:6px 12px;backdrop-filter:blur(6px);opacity:.0;transition:opacity .3s}
body:hover .ss-nav{opacity:.9}
.ss-nav button{all:unset;cursor:pointer;padding:2px 8px;border-radius:6px}
.ss-nav button:hover{background:rgba(255,255,255,.18)}
@media print{.ss-nav{display:none}}`;

const RUNTIME_JS = `(function(){
  var slides=[].slice.call(document.querySelectorAll('.ss-deck > .slide'));
  if(!slides.length)return;
  var i=Math.max(0,slides.findIndex(function(s){return s.classList.contains('active')}));
  if(i<0)i=0;
  function show(n){i=Math.max(0,Math.min(n,slides.length-1));
    slides.forEach(function(s,k){s.classList.toggle('active',k===i)});
    var c=document.querySelector('.ss-nav__c');if(c)c.textContent=(i+1)+' / '+slides.length;}
  function next(){show(i+1)} function prev(){show(i-1)}
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ')next();
    else if(e.key==='ArrowLeft'||e.key==='PageUp')prev();
    else if(e.key==='Home')show(0); else if(e.key==='End')show(slides.length-1);});
  var nav=document.querySelector('.ss-nav');
  if(nav){nav.querySelector('[data-p]').onclick=prev;nav.querySelector('[data-n]').onclick=next;}
  show(i);
})();`;

export function buildDeckHtml(deck) {
  if ((deck.mode || 'deck') === 'doc') return buildDocHtml(deck);
  const lang = deck.meta?.lang || 'it';
  const title = deck.meta?.title || 'Deck';
  const sections = deck.slides
    .map((s, idx) => {
      const cls = ['slide', ...(s.classes || []), idx === 0 ? 'active' : '']
        .filter(Boolean)
        .join(' ');
      const fs = s.fitScale && s.fitScale < 1 ? s.fitScale : 0;
      const st = fs ? ` style="transform:scale(${fs});transform-origin:top center"` : '';
      return `      <section class="${cls}"${st}>\n${indent(cleanSlideHtml(s.html), 8)}\n      </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
${indent(deck.styleCss || '', 4)}
  </style>
  <style>${RUNTIME_CSS}</style>
</head>
<body>
  <div class="deck ss-deck">
${sections}
  </div>
  <div class="ss-nav" aria-hidden="true">
    <button data-p title="Precedente">‹</button>
    <span class="ss-nav__c"></span>
    <button data-n title="Successiva">›</button>
  </div>
  <script>${RUNTIME_JS}</script>
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
