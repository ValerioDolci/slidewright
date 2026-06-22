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
    // Maniglia di spostamento dedicata (icona 4 frecce, sopra il box) — afferrala
    // per spostare senza ambiguità con il click-per-editare e senza che le maniglie
    // di resize "rubino" l'area sui box piccoli (come la croce di spostamento PPT).
    this.move = el('div', { class: 'sel__move', title: 'Trascina per spostare' });
    this.move.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" ' +
      'd="M13 6v5h5V7.75L22.25 12 18 16.25V13h-5v5h3.25L12 22.25 7.75 18H11v-5H6v3.25L1.75 12 6 7.75V11h5V6H7.75L12 1.75 16.25 6z"/></svg>';
    this.box.append(this.move);

    // Maniglia di rotazione (come quella di spostamento, accanto). Ruota l'elemento
    // attorno al suo centro; Shift = scatti di 15°.
    this.rotate = el('div', { class: 'sel__rotate', title: 'Trascina per ruotare (Shift = 15°)' });
    this.rotate.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" ' +
      'd="M12 5V2L7.5 6.5 12 11V7c2.8 0 5 2.2 5 5s-2.2 5-5 5-5-2.2-5-5H5c0 3.9 3.1 7 7 7s7-3.1 7-7-3.1-7-7-7z"/></svg>';
    this.box.append(this.rotate);
    this.overlay.append(this.box);

    this.box.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('sel__h')) return this._startResize(e);
      if (e.target.closest('.sel__rotate')) return this._startRotate(e);
      if (e.target.closest('.sel__move')) return this._startMove(e, true); // solo spostamento
      this._startMove(e, false);
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
    this.box.style.transform = r.angle ? `rotate(${r.angle}deg)` : '';
    // poco spazio sopra → metti le maniglie alte DENTRO il bordo (solo senza rotazione)
    this.box.classList.toggle('sel--toptight', r.angle === 0 && r.y < 34);
  }

  // Rende libero l'elemento lasciando un segnaposto (così gli altri box in flusso
  // non si riassestano). Logica centralizzata in Stage.makeFree.
  _ensureAbsolute(elm) {
    this.stage.makeFree(elm);
  }

  _num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }

  // ---- snap ----
  /** Linee bersaglio (x,y) dagli altri elementi + centro/bordi slide. */
  _snapTargets() {
    const sel = this.stage.getElement(this.eid);
    const X = [0, CANVAS.w / 2, CANVAS.w], Y = [0, CANVAS.h / 2, CANVAS.h];
    this.stage.slideEl.querySelectorAll(`[${EDITOR_ATTR}]`).forEach((n) => {
      if (n === sel || n.classList.contains('ss-root') || sel.contains(n) || n.contains(sel)) return;
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
  // Distingue click da trascinamento (soglia 4px). Superata la soglia = spostamento
  // (e solo allora un elemento in flusso diventa assoluto). Senza trascinamento, il
  // significato del click dipende da `moveOnly`:
  //  - dalla maniglia di spostamento (moveOnly=true): nessuna azione, solo muovere;
  //  - dal corpo del box (moveOnly=false): ⌥/⌘-click = "click through" sull'elemento
  //    sotto, click semplice = entra in editing testo (come il 2° click di PPT, così
  //    funziona anche il doppio click "lento" che non emette l'evento dblclick).
  _startMove(e, moveOnly = false) {
    e.preventDefault();
    const elm = this.stage.getElement(this.eid);
    if (!elm) return;
    try { this.box.setPointerCapture(e.pointerId); } catch (_) { /* headless/no-pointer */ }
    const sx = e.clientX, sy = e.clientY;
    const through = e.altKey || e.metaKey;
    const ang = this.stage.rectOf(this.eid)?.angle || 0; // niente snap se ruotato
    const snapOk = (this.stage.contentScale || 1) >= 1;   // niente snap se "Adattata"
    let started = false, init = null;

    const begin = () => {
      this._ensureAbsolute(elm);
      init = {
        s: this.stage.effScale,
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
      if (!ev.altKey && ang === 0 && snapOk) { // Alt / ruotato / adattato = niente snap
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
      } else if (!moveOnly) {
        if (through) {
          const p = this.stage.clientToLogical(sx, sy); // ⌥/⌘-click → elemento sotto
          this.stage.pickAt(p.x, p.y, true);
        } else {
          this.stage.beginEditingEid(this.eid); // click sul corpo → editing testo (PPT)
        }
      }
      // dalla maniglia di spostamento senza drag: nessuna azione
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
    if ((this.stage.rectOf(this.eid)?.angle || 0) !== 0) return this._startResizeRotated(e, dir, elm);
    try { this.box.setPointerCapture(e.pointerId); } catch (_) { /* headless/no-pointer */ }
    this._ensureAbsolute(elm);
    const sx = e.clientX, sy = e.clientY, s = this.stage.effScale;
    const x0 = this._num(elm.style.left), y0 = this._num(elm.style.top);
    // offset* (NON scalati): sotto "Adatta" il gBCR sarebbe scalato → il resize "saltava"
    const w0 = elm.offsetWidth;
    const h0 = elm.offsetHeight;
    const ratio = h0 > 0 ? w0 / h0 : 1;
    const snapOk = (this.stage.contentScale || 1) >= 1; // snap solo a scala piena
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
      if (!ev.shiftKey && !ev.altKey && snapOk) {
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

  // ---- resize di un elemento RUOTATO ----
  // Lavora nel frame locale (non ruotato) dell'elemento e tiene fisso in coordinate
  // schermo l'angolo/bordo opposto a quello trascinato (niente snap, niente guide).
  _startResizeRotated(e, dir, elm) {
    try { this.box.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    this._ensureAbsolute(elm);
    const s = this.stage.effScale;
    const ang = (this.stage.rectOf(this.eid)?.angle || 0) * Math.PI / 180;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const sx = e.clientX, sy = e.clientY;
    const x0 = this._num(elm.style.left), y0 = this._num(elm.style.top);
    const w0 = elm.offsetWidth, h0 = elm.offsetHeight;
    const ratio = h0 > 0 ? w0 / h0 : 1;
    const west = dir.includes('w'), east = dir.includes('e');
    const north = dir.includes('n'), south = dir.includes('s');
    const corner = (west || east) && (north || south);
    const rot = (vx, vy) => ({ x: vx * cos - vy * sin, y: vx * sin + vy * cos });
    const fx0 = west ? w0 : 0, fy0 = north ? h0 : 0;          // angolo/bordo opposto (locale)
    const cx0 = x0 + w0 / 2, cy0 = y0 + h0 / 2;               // centro iniziale (parent)
    const fRot0 = rot(fx0 - w0 / 2, fy0 - h0 / 2);
    const Pf = { x: cx0 + fRot0.x, y: cy0 + fRot0.y };        // punto fisso in coord. parent

    const move = (ev) => {
      const dxS = (ev.clientX - sx) / s, dyS = (ev.clientY - sy) / s;
      const dxL = dxS * cos + dyS * sin;                      // R(-θ): delta nel frame locale
      const dyL = -dxS * sin + dyS * cos;
      let w = w0, h = h0;
      if (east) w = Math.max(16, w0 + dxL);
      if (west) w = Math.max(16, w0 - dxL);
      if (south) h = Math.max(16, h0 + dyL);
      if (north) h = Math.max(16, h0 - dyL);
      if (ev.shiftKey && corner) { if (w / ratio >= 16) h = w / ratio; else w = h * ratio; }
      const nfx = west ? w : 0, nfy = north ? h : 0;
      const fRot = rot(nfx - w / 2, nfy - h / 2);
      const cx = Pf.x - fRot.x, cy = Pf.y - fRot.y;           // nuovo centro: Pf resta fisso
      elm.style.left = `${Math.round(cx - w / 2)}px`;
      elm.style.top = `${Math.round(cy - h / 2)}px`;
      elm.style.width = `${Math.round(w)}px`;
      elm.style.height = `${Math.round(h)}px`;
      this.refresh();
    };
    this._drag(move, e.pointerId);
  }

  // ---- rotazione ----
  _startRotate(e) {
    e.preventDefault();
    e.stopPropagation();
    const elm = this.stage.getElement(this.eid);
    if (!elm) return;
    // rendi libero PRIMA di ruotare (mentre l'angolo è 0): così la geometria letta
    // da makeFree è corretta e il successivo resize non legge un AABB ruotato.
    this._ensureAbsolute(elm);
    this.refresh();
    try { this.box.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    const br = this.box.getBoundingClientRect();              // AABB del box: il centro è invariante
    const cx = br.left + br.width / 2, cy = br.top + br.height / 2;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const rot0 = this.stage.rectOf(this.eid)?.angle || 0;
    let started = false;
    const move = (ev) => {
      started = true;
      let a = rot0 + (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI - a0);
      a = ev.shiftKey ? Math.round(a / 15) * 15 : Math.round(a);
      elm.style.transformOrigin = '50% 50%';
      elm.style.transform = a ? `rotate(${a}deg)` : '';
      this.refresh();
    };
    const up = () => {
      this.box.removeEventListener('pointermove', move);
      this.box.removeEventListener('pointerup', up);
      try { this.box.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
      if (started) this.onChange();
    };
    this.box.addEventListener('pointermove', move);
    this.box.addEventListener('pointerup', up);
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
