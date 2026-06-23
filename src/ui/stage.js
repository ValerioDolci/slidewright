/**
 * Stage: rendering della slide corrente in un <iframe> (isola gli stili del deck
 * da quelli dell'editor — decisione architetturale). Gestisce:
 *  - scala canvas logico 1280×720 → viewport;
 *  - stamping degli eid editor sugli elementi;
 *  - selezione (click) ed editing testo inline (doppio click → contenteditable);
 *  - serializzazione della slide corrente verso il modello (getHtml).
 */

import { CANVAS } from '../core/model.js';
import { EDITOR_ATTR, uid } from '../util/id.js';
import { inline, externalize } from '../core/assets.js';

// CSS iniettato SOLO nell'iframe dell'editor (mai esportato).
// NB: la root della slide è marcata con la classe `.ss-root` (NON con un id fisso):
// così l'id ORIGINALE della slide può essere conservato e le regole CSS del deck
// che stilano per id (#slide-9 …) continuano ad applicarsi. Le forzature di geometria
// (vedi [D4]) sono !important per vincere su eventuali #slide-N / .slide{width:…}.
// [F1] dimensione del canvas PER-DECK: la stessa CSS vale per qualsiasi misura 16:9
// (1280×720 canonico, ma anche 1920×1080 ecc. dopo la conversione). cw/ch = deck.canvas.
const iframeCss = (cw, ch) => `
  html,body{margin:0;width:${cw}px;height:${ch}px;overflow:hidden}
  /* [D4] TELA FISSA: la slide riempie SEMPRE il canvas ${cw}×${ch}, ancorata in
     alto a sinistra, senza transform del deck. left/top/width/height !important vincono su
     qualsiasi regola del deck (#slide-N, .slide{width:…}) → il box "fisso" è garantito, non
     aspirazionale. Contenuto che sfora → clippato da body{overflow:hidden} (badge ⚠). */
  .ss-root{position:absolute !important;left:0 !important;top:0 !important;
    right:auto !important;bottom:auto !important;margin:0 !important;
    width:${cw}px !important;height:${ch}px !important;
    opacity:1 !important;visibility:visible !important;
    transform:none !important;transition:none !important;pointer-events:auto !important}
  [${EDITOR_ATTR}]{cursor:default}
  [${EDITOR_ATTR}]:not(.ss-root):hover{outline:1px dashed rgba(180,83,9,.55);outline-offset:1px}
  .ss-selected{outline:2px solid #b45309 !important;outline-offset:1px}
  .ss-editing{outline:2px solid #0e7490 !important;cursor:text}
  .ss-editing *{cursor:text}
  ::selection{background:rgba(180,83,9,.35)}
`;

// CSS iframe per la modalità DOCUMENTO (altezza libera, niente forzature 16:9).
const DOC_IFRAME_CSS = `
  html,body{margin:0}
  .ss-root{min-height:100%}
  [${EDITOR_ATTR}]:not(.ss-root):hover{outline:1px dashed rgba(180,83,9,.55);outline-offset:1px}
  .ss-selected{outline:2px solid #b45309 !important;outline-offset:1px}
  .ss-editing{outline:2px solid #0e7490 !important;cursor:text}
  .ss-editing *{cursor:text}
  ::selection{background:rgba(180,83,9,.35)}
`;

export class Stage {
  constructor({ sceneEl, canvasEl, frameEl, overlayEl }) {
    this.scene = sceneEl;
    this.canvas = canvasEl;
    this.frame = frameEl;
    this.overlay = overlayEl;
    this.scale = 1;              // UNICA scala: canvas logico → pannello editor (esterna)
    this.canvasW = CANVAS.w;     // [F1] dimensione canvas PER-DECK (default = canonico 1280×720)
    this.canvasH = CANVAS.h;
    this.onSelect = () => {};
    this.onTextCommit = () => {};
    this.onBackground = () => {};
    this.onOverflow = () => {};
    this.onEditStart = () => {};
    this.onEditEnd = () => {};
    this.onKey = () => {};       // tasti dentro l'iframe → instradati all'App
    this.onDrop = () => {};      // file droppato SOPRA la slide → instradato all'App (con dataTransfer)
    this.onDragFileOver = () => {};
    this._editingEid = null;
    this._picking = null;        // callback "pipetta": prossimo click su un elemento → cb(el)
    this.selectedEid = null;     // eid selezionato (lo aggiorna l'App via onSelect)

    this.canvas.style.width = `${this.canvasW}px`;
    this.canvas.style.height = `${this.canvasH}px`;
    this.canvas.style.position = 'absolute';
    this.canvas.style.transformOrigin = 'top left';

    this._ro = new ResizeObserver(() => this.fitScale());
    this._ro.observe(this.scene);
    window.addEventListener('resize', () => this.fitScale());
  }

  get doc() {
    return this.frame.contentDocument;
  }

  get slideEl() {
    return this.doc?.querySelector('.ss-root') || null;
  }

  /** Scrive la slide nell'iframe e (ri)aggancia gli handler.
   *  `canvas` (opz.) = dimensione logica del deck {w,h}; default = canonico 1280×720. */
  render(slide, styleCss, mode = 'deck', canvas = null) {
    this.mode = mode;
    if (canvas && canvas.w && canvas.h) { this.canvasW = canvas.w; this.canvasH = canvas.h; }
    const doc = this.doc;
    doc.open();
    const idAttr = slide.elId ? ` id="${slide.elId}"` : '';
    if (mode === 'doc') {
      doc.write(
        `<!DOCTYPE html><html><head><meta charset="UTF-8">` +
        `<style>${styleCss || ''}</style><style>${DOC_IFRAME_CSS}</style></head>` +
        `<body><div${idAttr} class="ss-doc ss-root">${inline(slide.html)}</div></body></html>`
      );
    } else {
      doc.write(
        `<!DOCTYPE html><html><head><meta charset="UTF-8">` +
        `<style>${styleCss || ''}</style><style>${iframeCss(this.canvasW, this.canvasH)}</style></head>` +
        `<body><section${idAttr} class="slide active ss-root ${(slide.classes || []).join(' ')}">${inline(slide.html)}</section></body></html>`
      );
    }
    doc.close();
    this._editingEid = null;
    this._stampEids();
    this._wireEvents();
    this._applyOverflowFit();   // [F4] misura PRIMA (transform:none da D4), poi scala se sfora
    this.fitScale();
    // onOverflow riceve la scala overflow (1 = ci sta; <1 = slide rimpicciolita per starci).
    this.onOverflow(mode === 'deck' ? (this._overflowScale || 1) : 1);
  }

  /** Estensione (px) del contenuto IN FLUSSO della slide, ignorando i sottoalberi
   *  position:absolute/fixed (la grafica decorativa che sborda di proposito NON conta).
   *  Misurata SENZA transform (la root è transform:none per D4). */
  _measureContentExtent() {
    const root = this.slideEl;
    if (!root) return { maxB: 0, maxR: 0 };
    const win = this.doc.defaultView;
    const base = root.getBoundingClientRect();
    let maxB = 0, maxR = 0;
    const walk = (node) => {
      for (const c of node.children) {
        const cs = win.getComputedStyle(c);
        if (cs.position === 'absolute' || cs.position === 'fixed' || cs.display === 'none') continue;
        const r = c.getBoundingClientRect();
        if (r.width || r.height) {
          maxB = Math.max(maxB, r.bottom - base.top);
          maxR = Math.max(maxR, r.right - base.left);
        }
        walk(c);
      }
    };
    walk(root);
    return { maxB, maxR };
  }

  _checkOverflow() {
    const { maxB, maxR } = this._measureContentExtent();
    return maxB > this.canvasH + 2 || maxR > this.canvasW + 2;
  }

  /** [F4] Se il contenuto in-flusso sfora il canvas, scala la slide per starci INTERA
   *  (uniforme, ancorata in alto a sinistra) → fedele e proporzionale, identico in
   *  editor/presentazione/PDF. Sulle slide così scalate la selezione è sospesa (vedi App):
   *  niente compensazione di coordinate; la modifica piena passerà dal reflow (opt-in). */
  _applyOverflowFit() {
    this._overflowScale = 1;
    const root = this.slideEl;
    if (!root || this.mode === 'doc') return;
    const { maxB, maxR } = this._measureContentExtent();
    if (maxB > this.canvasH + 2 || maxR > this.canvasW + 2) {
      const s = Math.min(this.canvasW / Math.max(maxR, 1), this.canvasH / Math.max(maxB, 1), 1);
      if (s < 0.999) {
        // inline !important: vince sul `transform:none !important` dell'IFRAME_CSS [D4]
        root.style.setProperty('transform-origin', 'top left', 'important');
        root.style.setProperty('transform', `scale(${s})`, 'important');
        this._overflowScale = Math.max(0.2, s);
      }
    }
  }

  /** true sulle slide scalate per overflow: la selezione è sospesa (view + banner). */
  get viewLocked() { return (this._overflowScale || 1) < 1; }

  /** Assicura un eid su ogni elemento della slide (per selezione stabile). */
  _stampEids() {
    const root = this.slideEl;
    if (!root) return;
    root.setAttribute(EDITOR_ATTR, root.getAttribute(EDITOR_ATTR) || uid('e'));
    root.querySelectorAll('*').forEach((node) => {
      if (node.hasAttribute('data-ss-spacer')) return; // segnaposto: non editabile/selezionabile
      if (!node.getAttribute(EDITOR_ATTR)) node.setAttribute(EDITOR_ATTR, uid('e'));
    });
  }

  _wireEvents() {
    const doc = this.doc;
    // Click: seleziona l'elemento al punto. ⌥/⌘-click = "click through" (elemento
    // sotto a quelli sovrapposti). Le coord. dell'evento sono già nello spazio
    // logico dell'iframe (1280×720), quindi si passano dirette a pickAt.
    doc.addEventListener('click', (e) => {
      // modalità pipetta: il click NON seleziona, preleva il colore dall'elemento
      if (this._picking) {
        e.preventDefault(); e.stopPropagation();
        const t = e.target.closest(`[${EDITOR_ATTR}]`);
        const cb = this._picking; this._endPick();
        if (t) cb(t); // click sul vuoto → annulla soltanto
        return;
      }
      const a = e.target.closest('a');
      if (a) e.preventDefault(); // niente navigazione interna al deck
      // click dentro al testo in editing → lascia muovere il caret, non riselezionare
      if (this._editingEid) {
        const ed = this.getElement(this._editingEid);
        if (ed && ed.contains(e.target)) return;
      }
      this.pickAt(e.clientX, e.clientY, e.altKey || e.metaKey);
    });

    // Doppio click: editing testo inline.
    doc.addEventListener('dblclick', (e) => {
      if (this.viewLocked) return; // slide scalata per overflow: modifica sospesa
      const t = e.target.closest(`[${EDITOR_ATTR}]`);
      if (!t || t.classList.contains('ss-root')) return;
      this._beginEditing(t);
    });

    // Tastiera: cliccando nella slide il focus va DENTRO l'iframe, quindi i tasti
    // (Canc, frecce, ⌘Z…) arrivano qui e non al window del padre. Li inoltro
    // all'App con lo stesso handler (durante l'editing testo non interferisce:
    // l'handler dell'App esce subito se isEditing()).
    doc.addEventListener('keydown', (e) => {
      if (this._picking) { if (e.key === 'Escape') this._endPick(); e.preventDefault(); return; }
      this.onKey(e);
    });

    // Drag&drop di un file SOPRA la slide: l'iframe è un contesto a sé, quindi il
    // preventDefault sul window del padre NON lo copre → senza questo il browser
    // "naviga" l'iframe al file droppato (lo apre) invece di passarlo all'editor.
    doc.addEventListener('dragover', (e) => {
      if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
      e.preventDefault();
      this.onDragFileOver();
    });
    doc.addEventListener('drop', (e) => {
      e.preventDefault();
      this.onDrop(e.dataTransfer);
    });
  }

  /** Pipetta: il prossimo click su un elemento della slide chiama cb(elemento) invece
   *  di selezionarlo. Disabilito i pointer-event dell'overlay così il click arriva
   *  all'iframe anche sopra l'elemento già selezionato (il suo box li cattura). */
  startPick(cb) {
    this._picking = cb;
    if (this.doc) this.doc.body.style.cursor = 'crosshair';
    if (this.overlay) this.overlay.style.pointerEvents = 'none';
  }
  _endPick() {
    this._picking = null;
    if (this.doc) this.doc.body.style.cursor = '';
    if (this.overlay) this.overlay.style.pointerEvents = '';
  }

  /** Converte coordinate finestra-editor → coordinate logiche dell'iframe (per i
   *  click inoltrati dal box di selezione, che vive nel documento dell'editor). */
  clientToLogical(clientX, clientY) {
    const fr = this.frame.getBoundingClientRect();
    const s = this.scale || 1;
    return { x: (clientX - fr.left) / s, y: (clientY - fr.top) / s };
  }

  /** Elementi editabili impilati sotto un punto logico, dal più in alto al più in
   *  basso (dedup per elemento; esclude #ss-slide). Sospende temporaneamente i
   *  pointer-events per "vedere" anche gli elementi coperti. */
  _stackAt(lx, ly) {
    const doc = this.doc;
    if (!doc) return [];
    const out = [], touched = [];
    try {
      let node, guard = 0;
      // setProperty(..,'important'): se il deck ha pointer-events:…!important sui nodi,
      // un valore normale verrebbe ignorato → elementFromPoint ritorna sempre lo stesso
      // → loop. Il guard (50) è comunque un fermo di sicurezza.
      while (guard++ < 50 && (node = doc.elementFromPoint(lx, ly))) {
        if (node === doc.documentElement || node === doc.body) break;
        const sel = node.closest(`[${EDITOR_ATTR}]`);
        if (sel && !sel.classList.contains('ss-root') && !out.includes(sel)) out.push(sel);
        touched.push([node, node.style.getPropertyValue('pointer-events'), node.style.getPropertyPriority('pointer-events')]);
        node.style.setProperty('pointer-events', 'none', 'important');
      }
    } finally {
      // ripristina SEMPRE (anche su eccezione) il valore inline originale
      for (const [n, v, prio] of touched) {
        if (v) n.style.setProperty('pointer-events', v, prio); else n.style.removeProperty('pointer-events');
      }
    }
    return out;
  }

  /** Seleziona al punto logico (lx,ly). through=true (⌥/⌘) → l'elemento subito
   *  sotto a quello attualmente selezionato; altrimenti il più in alto. */
  pickAt(lx, ly, through = false) {
    if (this.viewLocked) { this.onBackground(); return; } // slide scalata per overflow: niente selezione
    const stack = this._stackAt(lx, ly);
    if (!stack.length) {
      if (this._editingEid) this._endEditing();
      this.onBackground();
      return;
    }
    let idx = 0;
    if (through) {
      const ci = stack.findIndex((n) => n.getAttribute(EDITOR_ATTR) === this.selectedEid);
      if (ci >= 0) idx = (ci + 1) % stack.length;
    }
    const target = stack[idx];
    const teid = target.getAttribute(EDITOR_ATTR);
    if (this._editingEid && this._editingEid !== teid) this._endEditing();
    this.onSelect(teid);
  }

  /** eid degli elementi selezionabili in ordine di documento (per Tab/⇧Tab). */
  editableList() {
    const root = this.slideEl;
    if (!root) return [];
    return [...root.querySelectorAll(`[${EDITOR_ATTR}]`)]
      .filter((n) => !n.classList.contains('ss-root'))
      .map((n) => n.getAttribute(EDITOR_ATTR));
  }

  /** Quanti elementi editabili stanno impilati al centro di `eid` (incl. antenati). */
  overlapCountFor(eid) {
    const r = this.rectOf(eid);
    if (!r) return 0;
    return this._stackAt(r.x + r.w / 2, r.y + r.h / 2).length;
  }

  /** true se al centro di `eid` c'è un altro elemento che NON è né antenato né
   *  discendente (sovrapposizione "vera", non semplice annidamento) → vale la
   *  pena suggerire ⌥-click / Tab. */
  hasForeignOverlap(eid) {
    const sel = this.getElement(eid);
    const r = this.rectOf(eid);
    if (!sel || !r) return false;
    return this._stackAt(r.x + r.w / 2, r.y + r.h / 2)
      .some((n) => n !== sel && !sel.contains(n) && !n.contains(sel));
  }

  /** Avvia l'editing testo dell'elemento dato (click sul box / doppio click).
   *  Salta gli elementi non testuali (immagini, media, controlli). */
  beginEditingEid(eid) {
    const elm = this.getElement(eid);
    if (!elm || elm.classList.contains('ss-root')) return;
    if (/^(IMG|SVG|CANVAS|VIDEO|AUDIO|IFRAME|INPUT|HR|BR)$/.test(elm.tagName)) return;
    this._beginEditing(elm);
  }

  /** Rende un elemento "libero" (position:absolute) congelando la sua geometria.
   *  Per non far riassestare gli altri elementi IN FLUSSO quando questo ne esce,
   *  lascia al suo posto un segnaposto invisibile della stessa ingombra (stesso
   *  slot di grid/flex/margine). Idempotente: se è già assoluto non fa nulla. */
  makeFree(elm) {
    if (!elm || elm.classList.contains('ss-root')) return;
    const cs = this.doc.defaultView.getComputedStyle(elm);
    if (cs.position === 'absolute' || cs.position === 'fixed') return;
    // offset* = geometria di LAYOUT (relativa all'offsetParent), NON influenzata da
    // transform (rotazione) né da scroll → coerente con `position:absolute`.
    const ow = elm.offsetWidth, oh = elm.offsetHeight, ol = elm.offsetLeft, ot = elm.offsetTop;
    const sp = this.doc.createElement('div');
    sp.setAttribute('data-ss-spacer', elm.getAttribute(EDITOR_ATTR) || '');
    sp.style.cssText =
      `width:${ow}px;height:${oh}px;margin:${cs.margin};` +
      `flex:${cs.flex};grid-area:${cs.gridArea};align-self:${cs.alignSelf};` +
      `justify-self:${cs.justifySelf};box-sizing:border-box;visibility:hidden;pointer-events:none`;
    elm.parentNode.insertBefore(sp, elm);
    elm.style.position = 'absolute';
    elm.style.boxSizing = 'border-box';
    elm.style.margin = '0';
    elm.style.left = `${ol}px`;
    elm.style.top = `${ot}px`;
    elm.style.width = `${ow}px`;
    elm.style.height = `${oh}px`;
  }

  _beginEditing(elm) {
    if (this._editingEid) this._endEditing();
    this._editingEid = elm.getAttribute(EDITOR_ATTR);
    elm.setAttribute('contenteditable', 'true');
    elm.classList.add('ss-editing');
    elm.focus();
    // incolla come testo semplice (niente markup/stili esterni nel deck)
    const onPaste = (ev) => {
      ev.preventDefault();
      const text = (ev.clipboardData || this.frame.contentWindow.clipboardData)?.getData('text/plain') || '';
      this.doc.execCommand('insertText', false, text);
    };
    elm.addEventListener('paste', onPaste);
    const onBlur = () => { elm.removeEventListener('paste', onPaste); this._endEditing(); };
    elm.addEventListener('blur', onBlur, { once: true });
    this.onEditStart(); // l'App nasconde il box di selezione (caret libero)
  }

  _endEditing() {
    const eid = this._editingEid;
    this._editingEid = null;
    if (!eid) return;
    const elm = this.getElement(eid);
    if (elm) {
      elm.removeAttribute('contenteditable');
      elm.classList.remove('ss-editing');
    }
    this.onTextCommit();
    this.onEditEnd(); // l'App ripristina il box di selezione
  }

  isEditing() {
    return !!this._editingEid;
  }

  getElement(eid) {
    if (!eid || !this.doc) return null;
    return this.doc.querySelector(`[${EDITOR_ATTR}="${CSS.escape(eid)}"]`);
  }

  /** innerHTML della slide corrente (per il commit nel modello).
   *  externalize: le immagini base64 tornano placeholder (history leggera). */
  getHtml() {
    return this.slideEl ? externalize(this.slideEl.innerHTML) : '';
  }

  /** Rettangolo logico (1280×720) di un elemento + angolo di rotazione, per
   *  disegnare il box di selezione. w/h sono la geometria NON ruotata (offset*),
   *  il centro è invariante alla rotazione (centro dell'AABB). */
  rectOf(eid) {
    const elm = this.getElement(eid);
    if (!elm) return null;
    // Con la tela fissa [D4] la root è a (0,0) di canvasW×canvasH e NON ha transform
    // interni: il getBoundingClientRect dell'iframe È già nello spazio logico dell'overlay.
    // w/h dalla geometria di layout (offset*, NON ruotata); il centro dall'gBCR (AABB se
    // ruotato) è invariante alla rotazione → box corretto anche ruotato.
    const r = elm.getBoundingClientRect();
    const w = elm.offsetWidth || r.width;
    const h = elm.offsetHeight || r.height;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h, angle: this._angleOf(elm) };
  }

  /** Angolo di rotazione (gradi) dall'inline transform dell'elemento. */
  _angleOf(elm) {
    const t = this.doc.defaultView.getComputedStyle(elm).transform;
    if (!t || t === 'none') return 0;
    try { const m = new DOMMatrixReadOnly(t); return Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI); }
    catch (_) { return 0; }
  }

  fitScale() {
    if (this.mode === 'doc') return this._fitDoc();
    const pad = 28;
    const sw = this.scene.clientWidth - pad * 2;
    const sh = this.scene.clientHeight - pad * 2;
    if (sw <= 0 || sh <= 0) return;
    this.scene.style.overflow = 'hidden';
    const s = Math.min(sw / this.canvasW, sh / this.canvasH);
    this.scale = s;
    this.canvas.style.position = 'absolute';
    this.canvas.style.width = `${this.canvasW}px`;
    this.canvas.style.height = `${this.canvasH}px`;
    this.canvas.style.transform = `scale(${s})`;
    this.canvas.style.left = `${Math.max(pad, (this.scene.clientWidth - this.canvasW * s) / 2)}px`;
    this.canvas.style.top = `${Math.max(pad, (this.scene.clientHeight - this.canvasH * s) / 2)}px`;
    this.onScale?.(s);
  }

  /** Modalità documento: larghezza piena (max 1100px), altezza = contenuto,
   *  scala 1 (niente transform), la scena scrolla in verticale. */
  _fitDoc() {
    const pad = 24;
    const avail = this.scene.clientWidth - pad * 2;
    if (avail <= 0) return;
    const w = Math.min(avail, 1100);
    this.scale = 1;
    this.scene.style.overflow = 'auto';
    this.canvas.style.position = 'relative';
    this.canvas.style.transform = 'none';
    this.canvas.style.left = '0';
    this.canvas.style.top = '0';
    this.canvas.style.margin = `${pad}px auto`;
    this.canvas.style.width = `${w}px`;
    // l'iframe (width 100%) ha già riflusso il contenuto a larghezza w → misura
    const body = this.doc?.body;
    const h = body ? Math.max(body.scrollHeight, 200) : 600;
    this.canvas.style.height = `${h}px`;
    this.onScale?.(1);
  }
}
