/**
 * App: orchestratore. Cabla store ↔ stage/sidebar/inspector/selection, gestisce
 * le azioni della toolbar, le scorciatoie e il ciclo commit→refresh.
 *
 * Principio: il re-render dello stage avviene SOLO su cambi strutturali
 * (load deck, cambio slide, undo/redo). Gli edit (testo/elementi) sono già nel
 * DOM dell'iframe: si serializzano nel modello senza re-render (niente flicker).
 */

import { store } from '../core/store.js';
import { createDeck, createSlide, cloneDeck, emptySlideHtml } from '../core/model.js';
import { parseDeck } from '../core/import.js';
import { buildDeckHtml } from '../core/export-html.js';
import { exportPdf } from '../core/export-pdf.js';
import { Stage } from './stage.js';
import { Sidebar } from './sidebar.js';
import { Inspector } from './inspector.js';
import { SelectionLayer } from './selection.js';
import { $, downloadText, readFileText, readFileDataURL } from '../util/dom.js';
import { EDITOR_ATTR, uid } from '../util/id.js';

export class App {
  constructor() {
    this.stage = new Stage({
      sceneEl: $('#stage-scene'),
      canvasEl: $('#stage-canvas'),
      frameEl: $('#slide-frame'),
      overlayEl: $('#overlay'),
    });
    this.sidebar = new Sidebar($('#thumbs'));
    this.inspector = new Inspector($('#inspector-title'), $('#inspector-body'));
    this.selection = new SelectionLayer(this.stage);

    this._wireStage();
    this._wireSidebar();
    this._wireInspector();
    this._wireToolbar();
    this._wireKeyboard();
    this._wireDnd();

    store.subscribe((reason) => this._onStore(reason));
    this.renderAll();
    this._hint('Pronto. Doppio click sul testo per modificarlo, trascina gli elementi liberi.');
  }

  // ---------- store reactions (solo UI leggera) ----------
  _onStore(reason) {
    this._updateToolbarState();
    if (reason === 'current') this.sidebar.setActive(store.currentIndex);
  }

  // ---------- stage ----------
  _wireStage() {
    this.stage.onSelect = (eid) => {
      store.setSelected(eid);
      this.selection.show(eid);
      this.inspector.render(eid);
    };
    this.stage.onBackground = () => this._deselect();
    this.stage.onTextCommit = () => {
      this.commitStage('Modifica testo');
      if (store.selectedEid) this.selection.refresh();
    };
    this.stage.onScale = () => {
      this.selection.refresh();
      this._updateZoom();
    };
    this.stage.onOverflow = (over) => {
      const w = $('#stage-warn');
      if (w) w.hidden = !over;
    };
  }

  _wireSidebar() {
    this.sidebar.onSelect = (i) => this.gotoSlide(i);
    this.sidebar.onReorder = (from, to) => {
      this.commitStage(null); // persisti edit correnti
      store.commit('Riordina slide', (d) => {
        const [m] = d.slides.splice(from, 1);
        d.slides.splice(to, 0, m);
      });
      const cur = store.currentIndex;
      const newCur = from === cur ? to : cur;
      this.renderAll();
      this.gotoSlide(newCur, true);
    };
    this.sidebar.onDuplicate = (i) => {
      this.commitStage(null);
      store.commit('Duplica slide', (d) => {
        const copy = { ...cloneDeck(d.slides[i]), id: uid('sl') };
        d.slides.splice(i + 1, 0, copy);
      });
      this.renderAll();
      this.gotoSlide(i + 1, true);
    };
    this.sidebar.onDelete = (i) => {
      if (store.deck.slides.length <= 1) return this._hint('Non puoi eliminare l\'ultima slide.');
      this.commitStage(null);
      store.commit('Elimina slide', (d) => { d.slides.splice(i, 1); });
      this.renderAll();
      this.gotoSlide(Math.min(i, store.deck.slides.length - 1), true);
    };
  }

  _wireInspector() {
    this.inspector.getElement = (eid) => this.stage.getElement(eid);
    this.inspector.commit = () => { this.commitStage('Stile elemento'); this.selection.refresh(); };
    this.inspector.liveRefresh = () => this.selection.refresh();
    this.inspector.duplicateElement = (eid) => this._duplicateElement(eid);
    this.inspector.deleteElement = (eid) => this._deleteElement(eid);
    this.inspector.selectParent = (eid) => {
      const p = this.stage.getElement(eid)?.parentElement;
      if (!p || p.id === 'ss-slide') return;
      const peid = p.getAttribute(EDITOR_ATTR);
      if (peid) this.stage.onSelect(peid);
    };
  }

  // ---------- toolbar ----------
  _wireToolbar() {
    const on = (action, fn) => {
      document.querySelectorAll(`[data-action="${action}"]`).forEach((b) => b.addEventListener('click', fn));
    };
    on('import', () => $('#file-input').click());
    on('new-deck', () => this._newDeck());
    on('export-html', () => this._exportHtml());
    on('export-pdf', () => this._exportPdf());
    on('undo', () => this._undo());
    on('redo', () => this._redo());
    on('add-text', () => this._addText());
    on('add-box', () => this._addBox());
    on('add-image', () => $('#image-input').click());
    on('add-slide', () => this._addSlide());
    on('present', () => this._present());
    const help = $('#help-pop');
    on('help', () => { help.hidden = false; });
    on('help-close', () => { help.hidden = true; });
    help.addEventListener('click', (e) => { if (e.target === help) help.hidden = true; });

    $('#file-input').addEventListener('change', (e) => this._onImportFile(e));
    $('#image-input').addEventListener('change', (e) => this._onImageFile(e));
  }

  _updateToolbarState() {
    const u = document.querySelector('[data-action="undo"]');
    const r = document.querySelector('[data-action="redo"]');
    if (u) u.disabled = !store.canUndo;
    if (r) r.disabled = !store.canRedo;
  }

  // ---------- keyboard ----------
  _wireKeyboard() {
    window.addEventListener('keydown', (e) => {
      const help = $('#help-pop');
      if (help && !help.hidden) { if (e.key === 'Escape') help.hidden = true; return; }
      if (this.stage.isEditing()) return; // lascia lavorare il contenteditable
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? this._redo() : this._undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); this._redo(); return; }
      if (e.key === 'Escape') { this._deselect(); return; }
      const eid = store.selectedEid;
      if (!eid) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this._deleteElement(eid); return; }
      const step = e.shiftKey ? 10 : 1;
      const map = { ArrowLeft: ['left', -step], ArrowRight: ['left', step], ArrowUp: ['top', -step], ArrowDown: ['top', step] };
      if (map[e.key]) {
        e.preventDefault();
        const elm = this.stage.getElement(eid);
        if (!elm) return;
        const cs = elm.ownerDocument.defaultView.getComputedStyle(elm);
        if (cs.position !== 'absolute' && cs.position !== 'fixed') return; // solo elementi liberi
        const [prop, d] = map[e.key];
        elm.style[prop] = `${(parseInt(elm.style[prop], 10) || 0) + d}px`;
        this.selection.refresh();
        this._nudgeCommit();
      }
    });
  }

  // commit "morbido" per i nudge: debounce per non intasare la history
  _nudgeCommit() {
    clearTimeout(this._nudgeT);
    this._nudgeT = setTimeout(() => this.commitStage('Sposta elemento'), 280);
  }

  _wireDnd() {
    const ov = $('#drop-overlay');
    let depth = 0;
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('dragenter', (e) => {
      if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
      depth++; ov.hidden = false;
    });
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; ov.hidden = true; } });
    window.addEventListener('drop', async (e) => {
      e.preventDefault(); depth = 0; ov.hidden = true;
      const file = e.dataTransfer?.files?.[0];
      if (file && /\.html?$/i.test(file.name)) this._loadDeckFromText(await readFileText(file), file.name);
    });
  }

  // ---------- rendering ----------
  renderAll() {
    this.selection.onChange = () => { this.commitStage('Sposta/ridimensiona'); this.selection.refresh(); };
    this.stage.render(store.currentSlide, store.deck.styleCss);
    this.sidebar.render(store.deck, store.currentIndex);
    this.inspector.clear();
    this.selection.hide();
    this._updateToolbarState();
    this._updateZoom();
  }

  renderStageOnly() {
    this.stage.render(store.currentSlide, store.deck.styleCss);
    this.inspector.clear();
    this.selection.hide();
    this._updateZoom();
  }

  gotoSlide(i, skipSync = false) {
    if (!skipSync) this.commitStage(null);
    store.setCurrentIndex(i);
    this.renderStageOnly();
    this.sidebar.setActive(store.currentIndex);
  }

  // serializza la slide corrente (DOM iframe → modello). label null = no history extra.
  commitStage(label) {
    const html = this.stage.getHtml();
    if (html == null) return;
    const cur = store.currentIndex;
    if (store.deck.slides[cur]?.html === html) return;
    store.commit(label || 'Modifica', (d) => { d.slides[cur].html = html; });
    this.sidebar.refreshThumb(store.deck, cur);
  }

  _deselect() {
    store.setSelected(null);
    this.selection.hide();
    this.inspector.clear();
  }

  // ---------- undo/redo ----------
  _undo() { if (store.canUndo) { store.undo(); this.afterHistory(); } }
  _redo() { if (store.canRedo) { store.redo(); this.afterHistory(); } }
  afterHistory() {
    this.sidebar.render(store.deck, store.currentIndex);
    this.renderStageOnly();
  }

  // ---------- elementi ----------
  _addFree(node, w, h) {
    const slide = this.stage.slideEl;
    if (!slide) return;
    node.setAttribute(EDITOR_ATTR, uid('e'));
    node.style.position = 'absolute';
    node.style.left = `${Math.round((1280 - w) / 2)}px`;
    node.style.top = `${Math.round((720 - h) / 2)}px`;
    node.style.width = `${w}px`;
    slide.appendChild(node);
    this.commitStage('Aggiungi elemento');
    this.stage.onSelect(node.getAttribute(EDITOR_ATTR));
  }

  _addText() {
    const d = this.stage.doc.createElement('div');
    d.textContent = 'Testo';
    Object.assign(d.style, { fontSize: '28px', color: '#f2efe9', fontFamily: '-apple-system,"SF Pro Text",sans-serif' });
    this._addFree(d, 280, 60);
  }

  _addBox() {
    const d = this.stage.doc.createElement('div');
    Object.assign(d.style, { height: '160px', background: 'rgba(180,83,9,0.18)', border: '1px solid rgba(180,83,9,0.5)', borderRadius: '14px' });
    this._addFree(d, 320, 160);
  }

  async _onImageFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = await readFileDataURL(file); // base64 inline (deck autoportante)
    const img = this.stage.doc.createElement('img');
    img.src = url;
    img.style.display = 'block';
    img.style.height = 'auto';
    this._addFree(img, 360, 240);
  }

  _duplicateElement(eid) {
    const elm = this.stage.getElement(eid);
    if (!elm || elm.id === 'ss-slide') return;
    const clone = elm.cloneNode(true);
    clone.querySelectorAll(`[${EDITOR_ATTR}]`).forEach((n) => n.setAttribute(EDITOR_ATTR, uid('e')));
    clone.setAttribute(EDITOR_ATTR, uid('e'));
    // se libero, sfalsa di 20px
    const cs = this.stage.doc.defaultView.getComputedStyle(elm);
    if (cs.position === 'absolute' || cs.position === 'fixed') {
      clone.style.left = `${(parseInt(elm.style.left, 10) || 0) + 20}px`;
      clone.style.top = `${(parseInt(elm.style.top, 10) || 0) + 20}px`;
    }
    elm.parentElement.appendChild(clone);
    this.commitStage('Duplica elemento');
    this.stage.onSelect(clone.getAttribute(EDITOR_ATTR));
  }

  _deleteElement(eid) {
    const elm = this.stage.getElement(eid);
    if (!elm || elm.id === 'ss-slide') return;
    elm.remove();
    this._deselect();
    this.commitStage('Elimina elemento');
  }

  _addSlide() {
    this.commitStage(null);
    store.commit('Nuova slide', (d) => {
      d.slides.splice(store.currentIndex + 1, 0, createSlide(emptySlideHtml()));
    });
    this.renderAll();
    this.gotoSlide(store.currentIndex + 1, true);
  }

  // ---------- file / deck ----------
  _newDeck() {
    store.setDeck(createDeck());
    this.renderAll();
    this._hint('Nuovo deck creato.');
  }

  async _onImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    this._loadDeckFromText(await readFileText(file), file.name);
  }

  _loadDeckFromText(text, name) {
    try {
      const deck = parseDeck(text);
      deck.meta.title = deck.meta.title || name.replace(/\.html?$/i, '');
      store.setDeck(deck);
      this.renderAll();
      const warn = deck._warnings?.length ? ` ⚠ ${deck._warnings[0]}` : '';
      this._hint(`Importato "${deck.meta.title}" — ${deck.slides.length} slide.${warn}`);
    } catch (err) {
      this._hint(`Errore import: ${err.message}`);
    }
  }

  _exportHtml() {
    this.commitStage(null);
    const html = buildDeckHtml(store.deck);
    downloadText(`${slug(store.deck.meta.title)}.html`, html);
    this._hint('HTML esportato.');
  }

  async _exportPdf() {
    this.commitStage(null);
    this._hint('Apertura stampa… scegli "Salva come PDF" e attiva "Grafica di sfondo".');
    await exportPdf(store.deck);
  }

  _present() {
    this.commitStage(null);
    const html = buildDeckHtml(store.deck);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ---------- misc ----------
  _hint(msg) { const h = $('#stage-hint'); if (h) h.textContent = msg; }
  _updateZoom() {
    const z = $('#zoom-label');
    if (z) z.textContent = `${Math.round(this.stage.scale * 100)}%`;
  }
}

function slug(s) {
  return String(s || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck';
}
