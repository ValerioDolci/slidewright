/**
 * App: orchestratore. Cabla store ↔ stage/sidebar/inspector/selection, gestisce
 * le azioni della toolbar, le scorciatoie e il ciclo commit→refresh.
 *
 * Principio: il re-render dello stage avviene SOLO su cambi strutturali
 * (load deck, cambio slide, undo/redo). Gli edit (testo/elementi) sono già nel
 * DOM dell'iframe: si serializzano nel modello senza re-render (niente flicker).
 */

import { store } from '../core/store.js';
import { createDeck, createSlide, cloneDeck, emptySlideHtml, CANVAS } from '../core/model.js';
import { parseDeck } from '../core/import.js';
import { buildDeckHtml } from '../core/export-html.js';
import { Stage } from './stage.js';
import { Sidebar } from './sidebar.js';
import { Inspector } from './inspector.js';
import { SelectionLayer } from './selection.js';
import { ChatPanel } from './chat.js';
import { runAgentTurn } from '../core/agent.js';
import { $, readFileText, readFileDataURL } from '../util/dom.js';
import { EDITOR_ATTR, uid } from '../util/id.js';
import { externalize, inline, describeAssetsForLlm, collectAssetIds, pruneAssets } from '../core/assets.js';
import { sanitizeHtml } from '../core/sanitize.js';

export class App {
  constructor({ platform }) {
    this.platform = platform;    // host adapter (web / vscode) — vedi platform/index.js
    this._fileName = null;
    this._dirty = false;
    this._loading = false;       // sopprime il "dirty" durante import
    this._clipboard = null;      // HTML elemento copiato (⌘C/⌘V)
    this.stage = new Stage({
      sceneEl: $('#stage-scene'),
      canvasEl: $('#stage-canvas'),
      frameEl: $('#slide-frame'),
      overlayEl: $('#overlay'),
    });
    this.sidebar = new Sidebar($('#thumbs'));
    this.inspector = new Inspector($('#inspector-title'), $('#inspector-body'));
    this.selection = new SelectionLayer(this.stage);
    this.chat = new ChatPanel({ storage: platform.storage });
    this.chat.onSend = (text) => this._runAgent(text);
    this._agentHistory = [];

    this._wireStage();
    this._wireSidebar();
    this._wireInspector();
    this._wireToolbar();
    this._wireKeyboard();
    this._wireDnd();
    this._initTheme();

    store.subscribe((reason) => this._onStore(reason));
    window.addEventListener('beforeunload', (e) => {
      if (this._dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    this.renderAll();
    this._updateFileStatus();
    this._hint(this.platform.capabilities.directSave
      ? 'Pronto. Apri un file per salvarci sopra, oppure doppio click sul testo per modificarlo.'
      : 'Pronto. Doppio click sul testo per modificarlo, trascina gli elementi liberi.');
  }

  // ---------- store reactions (solo UI leggera) ----------
  _onStore(reason) {
    this._updateToolbarState();
    if (reason === 'current') this.sidebar.setActive(store.currentIndex);
    // ogni cambio al DOCUMENTO marca dirty (non i cambi di sola UI)
    if (reason !== 'current' && reason !== 'selection' && !this._loading) this._markDirty();
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
    on('import', () => this._open());
    on('save', () => this._save());
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
    on('theme', () => this._toggleTheme());
    on('chat', () => this.chat.toggle());

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
      const meta = e.metaKey || e.ctrlKey;
      // ⌘S salva anche mentre si edita il testo
      if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); this._save(); return; }
      if (this.stage.isEditing()) return; // lascia lavorare il contenteditable
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? this._redo() : this._undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); this._redo(); return; }
      const sel = store.selectedEid;
      if (meta && e.key.toLowerCase() === 'c' && sel) { this._copyElement(sel); return; }
      if (meta && e.key.toLowerCase() === 'v' && this._clipboard) { e.preventDefault(); this._pasteElement(); return; }
      if (meta && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); this._duplicateElement(sel); return; }
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
  _applyMode() {
    document.body.classList.toggle('is-doc', (store.deck.mode || 'deck') === 'doc');
  }

  renderAll() {
    this.selection.onChange = () => { this.commitStage('Sposta/ridimensiona'); this.selection.refresh(); };
    this._applyMode();
    this.stage.render(store.currentSlide, store.deck.styleCss, store.deck.mode);
    this.sidebar.render(store.deck, store.currentIndex);
    this.inspector.clear();
    this.selection.hide();
    this._updateToolbarState();
    this._updateZoom();
  }

  renderStageOnly() {
    this._applyMode();
    this.stage.render(store.currentSlide, store.deck.styleCss, store.deck.mode);
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
    node.style.left = `${Math.round((CANVAS.w - w) / 2)}px`;
    node.style.top = `${Math.round((CANVAS.h - h) / 2)}px`;
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
    const look = this._sampleBoxStyle();
    if (look) Object.assign(d.style, look);
    else Object.assign(d.style, { background: 'rgba(180,83,9,0.18)', border: '1px solid rgba(180,83,9,0.5)', borderRadius: '14px' });
    d.style.height = '160px';
    this._addFree(d, 320, 160);
  }

  /** Stile "look" da una card/forma già presente nella slide (sfondo, bordo,
   *  raggio, ombra, blur) → la nuova forma nasce coerente col deck. null se niente. */
  _sampleBoxStyle() {
    const slide = this.stage.slideEl;
    if (!slide) return null;
    const win = this.stage.doc.defaultView;
    let cand = slide.querySelector('.card');
    if (!cand) {
      cand = [...slide.querySelectorAll('div, section, aside, figure')].find((n) => {
        if (n === slide || n.id === 'ss-slide') return false;
        const cs = win.getComputedStyle(n);
        const hasBg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none';
        const hasBorder = parseFloat(cs.borderTopWidth) > 0;
        const hasRadius = parseFloat(cs.borderTopLeftRadius) > 0;
        return (hasBg || hasBorder) && hasRadius; // sembra una "card"
      });
    }
    if (!cand) return null;
    const cs = win.getComputedStyle(cand);
    const look = {
      backgroundColor: cs.backgroundColor,
      borderRadius: cs.borderTopLeftRadius,
    };
    if (cs.backgroundImage !== 'none') look.backgroundImage = cs.backgroundImage;
    if (parseFloat(cs.borderTopWidth) > 0) look.border = `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`;
    if (cs.boxShadow && cs.boxShadow !== 'none') look.boxShadow = cs.boxShadow;
    if (cs.backdropFilter && cs.backdropFilter !== 'none') { look.backdropFilter = cs.backdropFilter; look.webkitBackdropFilter = cs.backdropFilter; }
    return look;
  }

  // ---------- agente (chat) ----------
  async _runAgent(text) {
    const conn = this.chat.getActiveConnection();
    if (!conn) { this.chat._openSettings(); return; }
    this.commitStage(null); // l'agente deve vedere gli edit correnti
    this.chat.setBusy(true);
    try {
      const reply = await runAgentTurn({
        connection: conn,
        ctx: this._agentContext(),
        history: this._agentHistory,
        userText: text,
        exec: (name, args) => this._agentExec(name, args),
        chatFn: (a) => this.platform.llmChat(a),
        onStep: (n, a) => this.chat.addStep(n, a),
      });
      this.chat.addAssistant(reply);
    } catch (e) {
      this.chat.addError(e.message);
    } finally {
      this.chat.setBusy(false);
    }
  }

  _agentContext() {
    const d = store.deck;
    return {
      mode: d.mode || 'deck',
      canvas: d.canvas,
      title: d.meta.title,
      currentIndex: store.currentIndex,
      slideTitles: d.slides.map((s, i) => `${i}: ${this._slideTitle(s)}`),
      styleCss: d.styleCss,
      currentSlideHtml: describeAssetsForLlm(d.slides[store.currentIndex]?.html || ''),
    };
  }

  _slideTitle(s) {
    const m = (s.html || '').match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
    const t = m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
    return t || '(senza titolo)';
  }

  /** Esegue un tool dell'agente via store.commit (→ undo/redo + autosave). */
  _agentExec(name, args) {
    const d = store.deck;
    const clean = (html) => externalize(sanitizeHtml(html || ''));
    switch (name) {
      case 'get_slide':
        return { html: describeAssetsForLlm(d.slides[args.index]?.html ?? '') || null };
      case 'update_slide':
        if (!d.slides[args.index]) return { error: 'indice non valido' };
        store.commit('AI · modifica slide', (x) => { x.slides[args.index].html = clean(args.html); });
        this._afterAgentEdit(args.index); return { ok: true };
      case 'add_slide': {
        const n = d.slides.length;
        const after = Math.max(-1, Math.min(Number.isInteger(args.afterIndex) ? args.afterIndex : n - 1, n - 1));
        store.commit('AI · nuova slide', (x) => { x.slides.splice(after + 1, 0, createSlide(clean(args.html))); });
        this._afterAgentEdit(after + 1); return { ok: true, total: store.deck.slides.length };
      }
      case 'delete_slide':
        if (!d.slides[args.index]) return { error: 'indice non valido' };
        if (d.slides.length <= 1) return { error: 'non puoi eliminare l\'ultima slide' };
        store.commit('AI · elimina slide', (x) => { x.slides.splice(args.index, 1); });
        this._afterAgentEdit(Math.min(args.index, store.deck.slides.length - 1)); return { ok: true };
      case 'reorder_slides': {
        const n = d.slides.length;
        const ok = Number.isInteger(args.from) && Number.isInteger(args.to) &&
          args.from >= 0 && args.from < n && args.to >= 0 && args.to < n;
        if (!ok) return { error: 'indici non validi' };
        store.commit('AI · riordina', (x) => { const [m] = x.slides.splice(args.from, 1); x.slides.splice(args.to, 0, m); });
        this._afterAgentEdit(args.to); return { ok: true };
      }
      case 'set_style_css':
        store.commit('AI · stile globale', (x) => { x.styleCss = String(args.css || ''); });
        this._afterAgentEdit(); return { ok: true };
      case 'set_title':
        store.commit('AI · titolo', (x) => { x.meta.title = String(args.title || x.meta.title); });
        return { ok: true };
      default:
        return { error: 'tool sconosciuto: ' + name };
    }
  }

  _afterAgentEdit(index) {
    this.sidebar.render(store.deck, store.currentIndex);
    if (Number.isInteger(index)) this.gotoSlide(index, true);
    else this.renderStageOnly();
  }

  // ---------- tema ----------
  _initTheme() {
    this._theme = this.platform.storage.get('ss-theme') || 'dark';
    this._applyTheme();
  }
  _toggleTheme() {
    this._theme = this._theme === 'light' ? 'dark' : 'light';
    this.platform.storage.set('ss-theme', this._theme);
    this._applyTheme();
    this.stage.fitScale();
    this.selection.refresh();
  }
  _applyTheme() {
    const light = this._theme === 'light';
    if (light) document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    const btn = document.querySelector('[data-action="theme"]');
    if (btn) { btn.textContent = light ? '☀' : '☾'; btn.title = light ? 'Passa al tema scuro' : 'Passa al tema chiaro'; }
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

  // ---------- clipboard (⌘C / ⌘V / ⌘D) ----------
  _copyElement(eid) {
    const elm = this.stage.getElement(eid);
    if (!elm || elm.id === 'ss-slide') return;
    this._clipboard = externalize(elm.outerHTML); // immagini → placeholder asset
    this._hint('Elemento copiato — ⌘V per incollare.');
  }

  _pasteElement() {
    const slide = this.stage.slideEl;
    if (!slide || !this._clipboard) return;
    const tpl = this.stage.doc.createElement('template');
    tpl.innerHTML = inline(this._clipboard);
    const node = tpl.content.firstElementChild;
    if (!node) return;
    node.querySelectorAll(`[${EDITOR_ATTR}]`).forEach((n) => n.setAttribute(EDITOR_ATTR, uid('e')));
    node.setAttribute(EDITOR_ATTR, uid('e'));
    if (node.style.position === 'absolute' || node.style.position === 'fixed') {
      node.style.left = `${(parseInt(node.style.left, 10) || 40) + 24}px`;
      node.style.top = `${(parseInt(node.style.top, 10) || 40) + 24}px`;
    }
    slide.appendChild(node);
    this.commitStage('Incolla elemento');
    this.stage.onSelect(node.getAttribute(EDITOR_ATTR));
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
  async _confirmDiscard() {
    if (!this._dirty) return true;
    return this.platform.confirm('Hai modifiche non salvate. Continuare e perderle?');
  }

  async _open() {
    if (!(await this._confirmDiscard())) return;
    const res = await this.platform.openDeck();
    if (res) this._loadDeckFromText(res.text, res.name, this.platform.canDirectSave());
  }

  async _newDeck() {
    if (!(await this._confirmDiscard())) return;
    this._loading = true;
    store.setDeck(createDeck());
    pruneAssets(new Set()); // deck vuoto: libera tutti gli asset del deck precedente
    this.renderAll();
    this._loading = false;
    this.platform.discardCurrent();
    this._fileName = null;
    this._dirty = true; // nuovo deck = non ancora salvato
    this._updateFileStatus();
    this._hint(this.platform.capabilities.directSave ? 'Nuovo deck. ⌘S per salvarlo su un file.' : 'Nuovo deck creato.');
  }

  _loadDeckFromText(text, name, bound = false) {
    if (!bound) this.platform.discardCurrent(); // drop/fallback: niente handle stantio del file precedente
    this._loading = true;
    try {
      const deck = parseDeck(text);
      deck.meta.title = deck.meta.title || name.replace(/\.html?$/i, '');
      store.setDeck(deck);
      // history azzerata da setDeck → si possono liberare gli asset del deck precedente
      pruneAssets(collectAssetIds(deck.slides.map((s) => s.html)));
      this.renderAll();
      this._fileName = name || null;
      this._dirty = false;
      const warn = deck._warnings?.length ? ` ⚠ ${deck._warnings[0]}` : '';
      const where = bound ? ' — le modifiche si salveranno su questo file' : '';
      this._hint(`Aperto "${deck.meta.title}" — ${deck.slides.length} slide${where}.${warn}`);
    } catch (err) {
      this._hint(`Errore apertura: ${err.message}`);
    } finally {
      this._loading = false;
      this._updateFileStatus();
    }
  }

  // ---------- salvataggio diretto sul file (.html) ----------
  async _save() {
    if (!this.platform.canDirectSave()) return this._saveAs();
    clearTimeout(this._saveT);
    this.commitStage(null); // cattura testo in corso di modifica
    this._setFileStatus('salvataggio…');
    const r = await this.platform.save(buildDeckHtml(store.deck));
    if (r === 'no-doc') return this._saveAs();
    if (r === 'denied') { this._setFileStatus('permesso negato'); return; }
    if (r === 'error') { this._setFileStatus('errore salvataggio'); return; }
    this._dirty = false;
    this._updateFileStatus();
  }

  async _saveAs() {
    clearTimeout(this._saveT);
    this.commitStage(null);
    const name = `${slug(store.deck.meta.title)}.html`;
    const r = await this.platform.saveAs(buildDeckHtml(store.deck), name);
    if (r.status !== 'saved') return; // annullato / errore
    this._fileName = r.name || name;
    this._dirty = false;
    this._updateFileStatus();
  }

  _markDirty() {
    this._dirty = true;
    this._updateFileStatus();
    if (this.platform.canDirectSave()) { // autosave sul file aperto (debounce)
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => this._save(), 1200);
    }
  }

  _updateFileStatus() {
    const el = $('#file-status');
    if (el) {
      const name = this._fileName || (this._dirty ? '(non salvato)' : '');
      el.textContent = name ? `${name}${this._dirty ? ' ●' : ''}` : '';
      el.classList.toggle('is-dirty', this._dirty);
    }
    const sb = document.querySelector('[data-action="save"]');
    if (sb) sb.classList.toggle('btn--accent', this._dirty);
  }

  _setFileStatus(msg) {
    const el = $('#file-status');
    if (!el) return;
    if (msg) el.textContent = msg;
    else this._updateFileStatus();
  }

  async _exportHtml() {
    this.commitStage(null);
    await this.platform.exportHtml(buildDeckHtml(store.deck), `${slug(store.deck.meta.title)}.html`);
    this._hint('HTML esportato (copia separata).');
  }

  async _exportPdf() {
    this.commitStage(null);
    this._hint('Apertura stampa… scegli "Salva come PDF" e attiva "Grafica di sfondo".');
    await this.platform.exportPdf(store.deck);
  }

  _present() {
    this.commitStage(null);
    this.platform.present(buildDeckHtml(store.deck));
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
