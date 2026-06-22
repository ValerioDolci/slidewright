/**
 * SelectionLayer: disegna nel overlay (spazio logico 1280×720) il box di
 * selezione con 8 maniglie di resize + drag per spostare. Lavora su elementi
 * "liberi" (position:absolute); un elemento in flusso viene convertito in
 * assoluto **congelando** la sua geometria attuale al primo move/resize.
 *
 * - Tutte le coordinate del overlay sono in px logici; i delta del puntatore
 *   (screen px) vengono divisi per stage.scale.
 * - Snap & guide (item 5): durante move/resize i bordi/centri si agganciano a
 *   quelli degli altri elementi e al centro/bordi della slide (soglia 6px),
 *   con guide visive.
 * - Shift durante il resize d'angolo blocca le proporzioni (item 3).
 */

import { el } from '../util/dom.js';
import { EDITOR_ATTR } from '../util/id.js';
import { CANVAS } from '../core/model.js';

const HANDLES = [
  ['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0],
  ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1],
  ['sw', 0, 1], ['w', 0, 0.5],
];
const SNAP = 6; // soglia di aggancio (px logici)

export class SelectionLayer {
  constructor(stage) {
    this.stage = stage;
    this.overlay = stage.overlay;
    this.eid = null;
    this.onChange = () => {}; // commit a fine drag
    this._build();
  }

  _build() {
    this.guides = el('div', { class: 'guides' });
    this.overlay.append(this.guides);

    this.box = el('div', { class: 'sel' });
    this.box.style.display = 'none';
    HANDLES.forEach(([dir]) => {
      this.box.append(el('div', { class: `sel__h sel__h--${dir}`, dataset: { dir } }));
    });
    this.overlay.append(this.box);

    this.box.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('sel__h')) return this._startResize(e);
      this._startMove(e);
    });
    // Doppio click sul box → editing testo dell'elemento selezionato (il box
    // copre l'elemento, quindi l'iframe non riceverebbe il dblclick).
    this.box.addEventListener('dblclick', (e) => {
      if (e.target.classList.contains('sel__h')) return;
      e.preventDefault();
      if (this.eid) this.stage.beginEditingEid(this.eid);
    });
  }

  hide() {
    this.eid = null;
    this.box.style.display = 'none';
    this._clearGuides();
  }

  /** Nasconde il box senza perdere la selezione (durante l'editing del testo). */
  suspend() {
    this._suspended = true;
    this.box.style.display = 'none';
    this._clearGuides();
  }

  resume() {
    this._suspended = false;
    this.refresh();
  }

  show(eid) {
    this.eid = eid;
    this.refresh();
  }

  refresh() {
    if (!this.eid || this._suspended) return;
    const r = this.stage.rectOf(this.eid);
    if (!r) return this.hide();
    this.box.style.display = 'block';
    this.box.style.left = `${r.x}px`;
    this.box.style.top = `${r.y}px`;
    this.box.style.width = `${r.w}px`;
    this.box.style.height = `${r.h}px`;
  }

  _ensureAbsolute(elm) {
    const cs = this.stage.doc.defaultView.getComputedStyle(elm);
    if (cs.position === 'absolute' || cs.position === 'fixed') return;
    const parent = elm.offsetParent || this.stage.slideEl;
    const er = elm.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    elm.style.position = 'absolute';
    elm.style.boxSizing = 'border-box';
    elm.style.margin = '0';
    elm.style.left = `${er.left - pr.left + parent.scrollLeft}px`;
    elm.style.top = `${er.top - pr.top + parent.scrollTop}px`;
    elm.style.width = `${er.width}px`;
    elm.style.height = `${er.height}px`;
  }

  _num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }

  // ---- snap ----
  /** Linee bersaglio (x,y) dagli altri elementi + centro/bordi slide. */
  _snapTargets() {
    const sel = this.stage.getElement(this.eid);
    const X = [0, CANVAS.w / 2, CANVAS.w], Y = [0, CANVAS.h / 2, CANVAS.h];
    this.stage.slideEl.querySelectorAll(`[${EDITOR_ATTR}]`).forEach((n) => {
      if (n === sel || n.id === 'ss-slide' || sel.contains(n) || n.contains(sel)) return;
      const r = n.getBoundingClientRect();
      X.push(r.left, r.left + r.width / 2, r.left + r.width);
      Y.push(r.top, r.top + r.height / 2, r.top + r.height);
    });
    return { X, Y };
  }

  /** Aggancia un insieme di linee dell'elemento ai bersagli; ritorna delta+linea. */
  _snapAxis(lines, targets) {
    let best = { delta: 0, line: null };
    for (const pos of lines) {
      for (const t of targets) {
        const d = t - pos;
        if (Math.abs(d) <= SNAP && (best.line === null || Math.abs(d) < Math.abs(best.delta))) {
          best = { delta: d, line: t };
        }
      }
    }
    return best;
  }

  _drawGuides(vx, hy) {
    this._clearGuides();
    if (vx != null) {
      const g = el('div', { class: 'guide guide--v' }); g.style.left = `${vx}px`; this.guides.append(g);
    }
    if (hy != null) {
      const g = el('div', { class: 'guide guide--h' }); g.style.top = `${hy}px`; this.guides.append(g);
    }
  }
  _clearGuides() { this.guides.replaceChildren(); }

  // ---- move ----
  // Distingue click da trascinamento: finché il puntatore non supera la soglia è
  // un click. Click semplice = mantiene la selezione; ⌥/⌘-click = "click through"
  // sull'elemento sotto. Solo superata la soglia parte lo spostamento vero (e solo
  // allora un elemento in flusso viene reso assoluto).
  _startMove(e) {
    e.preventDefault();
    const elm = this.stage.getElement(this.eid);
    if (!elm) return;
    try { this.box.setPointerCapture(e.pointerId); } catch (_) { /* headless/no-pointer */ }
    const sx = e.clientX, sy = e.clientY;
    const through = e.altKey || e.metaKey;
    let started = false, init = null;

    const begin = () => {
      this._ensureAbsolute(elm);
      init = {
        s: this.stage.scale,
        x0: this._num(elm.style.left),
        y0: this._num(elm.style.top),
        w: elm.getBoundingClientRect().width,
        h: elm.getBoundingClientRect().height,
        targets: this._snapTargets(),
      };
    };

    const move = (ev) => {
      if (!started) {
        if (Math.abs(ev.clientX - sx) < 4 && Math.abs(ev.clientY - sy) < 4) return;
        started = true; begin();
      }
      let x = Math.round(init.x0 + (ev.clientX - sx) / init.s);
      let y = Math.round(init.y0 + (ev.clientY - sy) / init.s);
      let vx = null, hy = null;
      if (!ev.altKey) { // Alt durante il drag = disattiva snap
        const sX = this._snapAxis([x, x + init.w / 2, x + init.w], init.targets.X);
        const sY = this._snapAxis([y, y + init.h / 2, y + init.h], init.targets.Y);
        x += sX.delta; y += sY.delta; vx = sX.line; hy = sY.line;
      }
      elm.style.left = `${x}px`;
      elm.style.top = `${y}px`;
      this.refresh();
      this._drawGuides(vx, hy);
    };

    const up = () => {
      this.box.removeEventListener('pointermove', move);
      this.box.removeEventListener('pointerup', up);
      try { this.box.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
      this._clearGuides();
      if (started) {
        this.onChange();              // commit dello spostamento
      } else if (through) {
        const p = this.stage.clientToLogical(sx, sy); // click ⌥/⌘ → elemento sotto
        this.stage.pickAt(p.x, p.y, true);
      }
      // click semplice senza modificatore: nessuna azione (mantiene la selezione)
    };

    this.box.addEventListener('pointermove', move);
    this.box.addEventListener('pointerup', up);
  }

  // ---- resize ----
  _startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const dir = e.target.dataset.dir;
    const elm = this.stage.getElement(this.eid);
    if (!elm) return;
    try { this.box.setPointerCapture(e.pointerId); } catch (_) { /* headless/no-pointer */ }
    this._ensureAbsolute(elm);
    const sx = e.clientX, sy = e.clientY, s = this.stage.scale;
    const x0 = this._num(elm.style.left), y0 = this._num(elm.style.top);
    const w0 = elm.getBoundingClientRect().width;
    const h0 = elm.getBoundingClientRect().height;
    const ratio = h0 > 0 ? w0 / h0 : 1;
    const west = dir.includes('w'), east = dir.includes('e');
    const north = dir.includes('n'), south = dir.includes('s');
    const corner = (west || east) && (north || south);
    const targets = this._snapTargets();

    const move = (ev) => {
      const dx = (ev.clientX - sx) / s;
      const dy = (ev.clientY - sy) / s;
      let x = x0, y = y0, w = w0, h = h0;
      if (east) w = Math.max(16, w0 + dx);
      if (west) w = Math.max(16, w0 - dx);
      if (south) h = Math.max(16, h0 + dy);
      if (north) h = Math.max(16, h0 - dy);

      // Shift su angolo: blocca proporzioni (item 3)
      if (ev.shiftKey && corner) {
        if (w / ratio >= 16) h = w / ratio; else w = h * ratio;
      }

      // riposiziona left/top per le maniglie ovest/nord
      if (west) x = x0 + (w0 - w);
      if (north) y = y0 + (h0 - h);

      // snap del bordo mosso (no in ratio-lock per non litigare col vincolo)
      let vx = null, hy = null;
      if (!ev.shiftKey && !ev.altKey) {
        if (east) { const sn = this._snapAxis([x + w], targets.X); if (sn.line != null) { w = Math.max(16, w + sn.delta); vx = sn.line; } }
        else if (west) { const sn = this._snapAxis([x], targets.X); if (sn.line != null) { x += sn.delta; w = Math.max(16, w - sn.delta); vx = sn.line; } }
        if (south) { const sn = this._snapAxis([y + h], targets.Y); if (sn.line != null) { h = Math.max(16, h + sn.delta); hy = sn.line; } }
        else if (north) { const sn = this._snapAxis([y], targets.Y); if (sn.line != null) { y += sn.delta; h = Math.max(16, h - sn.delta); hy = sn.line; } }
      }

      elm.style.left = `${Math.round(x)}px`;
      elm.style.top = `${Math.round(y)}px`;
      elm.style.width = `${Math.round(w)}px`;
      elm.style.height = `${Math.round(h)}px`;
      this.refresh();
      this._drawGuides(vx, hy);
    };
    this._drag(move, e.pointerId);
  }

  _drag(move, pointerId) {
    const up = () => {
      this.box.removeEventListener('pointermove', move);
      this.box.removeEventListener('pointerup', up);
      try { this.box.releasePointerCapture(pointerId); } catch (_) { /* noop */ }
      this._clearGuides();
      this.onChange();
    };
    this.box.addEventListener('pointermove', move);
    this.box.addEventListener('pointerup', up);
  }
}
